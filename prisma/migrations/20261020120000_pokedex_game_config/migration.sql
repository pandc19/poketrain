-- Which games list a Pokédex, and in what order, moves to the game config, so paired games
-- (Scarlet and Violet) can share one. A Pokédex row no longer belongs to a single game.
ALTER TABLE "pokedexes" DROP CONSTRAINT "pokedexes_game_id_fkey";
ALTER TABLE "pokedexes" DROP COLUMN "game_id";
ALTER TABLE "pokedexes" DROP COLUMN "sort_order";
