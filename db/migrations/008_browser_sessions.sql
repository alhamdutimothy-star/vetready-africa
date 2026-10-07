-- Only a random session handle digest is retained. Access/ID tokens are never stored here.
CREATE TABLE browser_sessions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),handle_hash text NOT NULL UNIQUE CHECK(handle_hash ~ '^[a-f0-9]{64}$'),
 user_id uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,revoked_at timestamptz,CHECK(expires_at>created_at)
);
CREATE INDEX active_browser_sessions ON browser_sessions(user_id,expires_at) WHERE revoked_at IS NULL;
