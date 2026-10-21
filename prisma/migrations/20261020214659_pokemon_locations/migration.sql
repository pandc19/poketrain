-- CreateTable
CREATE TABLE "pokemon_locations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "version_group" TEXT NOT NULL,
    "species_id" INTEGER NOT NULL,
    "variant" TEXT NOT NULL DEFAULT '',
    "result" JSONB NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "prompt_version" INTEGER NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pokemon_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pokemon_locations_version_group_species_id_variant_key" ON "pokemon_locations"("version_group", "species_id", "variant");

-- AddForeignKey
ALTER TABLE "pokemon_locations" ADD CONSTRAINT "pokemon_locations_species_id_fkey" FOREIGN KEY ("species_id") REFERENCES "species"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pokemon_locations" ADD CONSTRAINT "pokemon_locations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
