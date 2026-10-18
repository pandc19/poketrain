-- A Pokémon the player left out of the breeding plans.
ALTER TABLE "roster_pokemon" ADD COLUMN "breeding_off" BOOLEAN NOT NULL DEFAULT false;
