CREATE TYPE "integration_type" AS ENUM ('email', 'cos');

CREATE TYPE "integration_status" AS ENUM ('pending', 'verified', 'invalid');

CREATE TABLE "family_integration_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "family_id" UUID NOT NULL,
    "integration_type" "integration_type" NOT NULL,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "encrypted_credentials" BYTEA NOT NULL,
    "credential_nonce" BYTEA NOT NULL,
    "credential_auth_tag" BYTEA NOT NULL,
    "wrapped_data_key" BYTEA NOT NULL,
    "data_key_nonce" BYTEA NOT NULL,
    "data_key_auth_tag" BYTEA NOT NULL,
    "key_version" VARCHAR(40) NOT NULL,
    "status" "integration_status" NOT NULL DEFAULT 'pending',
    "last_verified_at" TIMESTAMPTZ(3),
    "last_verification_result" JSONB,
    "created_by" UUID NOT NULL,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "family_integration_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "family_integration_settings_encryption_lengths_check" CHECK (
        octet_length("encrypted_credentials") > 0
        AND octet_length("credential_nonce") = 12
        AND octet_length("credential_auth_tag") = 16
        AND octet_length("wrapped_data_key") = 32
        AND octet_length("data_key_nonce") = 12
        AND octet_length("data_key_auth_tag") = 16
    ),
    CONSTRAINT "family_integration_settings_key_version_check" CHECK (char_length("key_version") > 0)
);

CREATE UNIQUE INDEX "family_integration_settings_family_id_integration_type_key"
    ON "family_integration_settings"("family_id", "integration_type");

CREATE INDEX "family_integration_settings_family_id_status_idx"
    ON "family_integration_settings"("family_id", "status");

CREATE INDEX "family_integration_settings_key_version_idx"
    ON "family_integration_settings"("key_version");

ALTER TABLE "family_integration_settings"
    ADD CONSTRAINT "family_integration_settings_family_id_fkey"
    FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "family_integration_settings"
    ADD CONSTRAINT "family_integration_settings_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "family_integration_settings"
    ADD CONSTRAINT "family_integration_settings_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
