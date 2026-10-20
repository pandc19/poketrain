/**
 * Runs the account tasks by hand, until the admin page exists:
 *
 *   npm run accounts -- admin            set the email and password you log in with as the owner
 *   npm run accounts -- invite [email]   make a one-time invite link (for that email only, if given)
 *   npm run accounts -- requests         list the people asking for an invite
 *   npm run accounts -- invite --request <id>   invite one of them (marks the request as invited)
 *   npm run accounts -- reset <email>    make a one-time link to choose a new password
 *   npm run accounts -- users            list the accounts
 *
 * It only touches the database named by DATABASE_URL. `admin` asks for the password without showing it; to
 * run it without a terminal set ADMIN_EMAIL and ADMIN_PASSWORD instead. Links are built from APP_URL.
 */
import { createInterface } from 'node:readline';
import { prisma } from '../src/lib/db';
import { LOCAL_USER_ID } from '../src/lib/constants';
import { createInvite, createPasswordReset, normalizeEmail, setCredentials } from '../src/lib/auth/accounts';
import { MIN_PASSWORD_LENGTH } from '../src/lib/auth/password';

const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Typed characters are swallowed: only the question itself is written.
      const out = rl as unknown as { _writeToOutput: (s: string) => void };
      const write = out._writeToOutput.bind(rl);
      out._writeToOutput = (s) => {
        if (s.startsWith(question)) write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function admin() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL || (await ask('Email to log in with: ')));
  if (!email.includes('@')) throw new Error('That is not an email address.');
  const password = process.env.ADMIN_PASSWORD || (await ask('Password (not shown): ', true));
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`The password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (!process.env.ADMIN_PASSWORD && (await ask('Repeat the password: ', true)) !== password) throw new Error('The passwords are not the same.');

  const owner = await prisma.user.findUnique({ where: { id: LOCAL_USER_ID }, select: { id: true } });
  if (!owner) throw new Error('The owner does not exist yet: run the migrations (and `npm run db:seed` on a new database) first.');
  await setCredentials(owner.id, email, password);
  await prisma.user.update({ where: { id: owner.id }, data: { role: 'ADMIN', aiEnabled: true } });
  console.log(`Done. Log in at ${appUrl}/login as ${email}.`);
}

async function invite(args: string[]) {
  const at = args.indexOf('--request');
  const requestId = at >= 0 ? args[at + 1] : null;
  let email = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--request') ?? null;
  if (requestId) {
    const request = await prisma.inviteRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new Error(`No request with id ${requestId}. See: npm run accounts -- requests`);
    email = request.email;
    console.log(`Request from ${request.name} <${request.email}>`);
  }
  const code = await createInvite({ email, requestId, createdById: LOCAL_USER_ID });
  console.log(`Invite link${email ? ` for ${email}` : ''} (works once, shown only now):\n\n  ${appUrl}/register?invite=${code}\n`);
}

async function requests() {
  const rows = await prisma.inviteRequest.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } });
  if (rows.length === 0) return console.log('No requests waiting.');
  for (const r of rows) {
    console.log(`${r.id}  ${r.createdAt.toISOString().slice(0, 10)}  ${r.name} <${r.email}>${r.message ? `\n    "${r.message}"` : ''}`);
  }
  console.log(`\nInvite one with: npm run accounts -- invite --request <id>`);
}

async function reset(args: string[]) {
  const email = normalizeEmail(args[0] ?? '');
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!user) throw new Error(`No account with the email "${email}".`);
  const token = await createPasswordReset(user.id);
  console.log(`Password link for ${user.name} (works once, for a day, shown only now):\n\n  ${appUrl}/reset-password?token=${token}\n`);
}

async function users() {
  const rows = await prisma.user.findMany({ orderBy: { createdAt: 'asc' }, select: { name: true, email: true, role: true, aiEnabled: true, createdAt: true, _count: { select: { sessions: true } } } });
  for (const u of rows) {
    console.log(`${u.role.padEnd(5)} ${(u.email ?? '(no login)').padEnd(34)} ${u.name.padEnd(16)} AI ${u.aiEnabled ? 'on ' : 'off'}  logins ${u._count.sessions}  since ${u.createdAt.toISOString().slice(0, 10)}`);
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const commands: Record<string, (args: string[]) => Promise<void>> = { admin, invite, requests, reset, users };
  const run = commands[command ?? ''];
  if (!run) {
    console.log('Usage: npm run accounts -- <admin | invite [email] | invite --request <id> | requests | reset <email> | users>');
    process.exit(command ? 1 : 0);
  }
  await run(args);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
