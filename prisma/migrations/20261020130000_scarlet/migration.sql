-- Pokémon Scarlet. Production never runs the seed, so the game's row and the local user's
-- save profile are added here. Both are no-ops where they already exist (a seeded database),
-- and the profile is only added where the local user does (not on an empty database).
INSERT INTO "games" ("id", "name", "version_group", "generation", "sort_order")
VALUES ('scarlet', 'Pokémon Scarlet', 'scarlet-violet', 9, 1)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "game_profiles" ("user_id", "game_id", "name")
SELECT "id", 'scarlet', 'Main save' FROM "users" WHERE "id" = '00000000-0000-7000-8000-000000000001'
ON CONFLICT ("user_id", "game_id", "name") DO NOTHING;
