ALTER TABLE "users"
ADD CONSTRAINT "users_role_credentials_consistency_check"
CHECK (
  (
    "role" = 'parent'
    AND "email" IS NOT NULL
    AND "password_hash" IS NOT NULL
    AND "child_credential_hash" IS NULL
    AND "credential_type" IS NULL
  )
  OR
  (
    "role" = 'child'
    AND "email" IS NULL
    AND "password_hash" IS NULL
    AND "child_credential_hash" IS NOT NULL
    AND "credential_type" IS NOT NULL
    AND "gender" IS NOT NULL
  )
);

ALTER TABLE "users"
ADD CONSTRAINT "users_child_credential_bcrypt_check"
CHECK (
  "child_credential_hash" IS NULL
  OR "child_credential_hash" ~ '^[$]2[aby][$]12[$]'
);
