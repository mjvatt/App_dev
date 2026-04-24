CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    email       TEXT        UNIQUE NOT NULL,
    username    TEXT        UNIQUE NOT NULL,
    hashed_password TEXT    NOT NULL,
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ
);

CREATE TABLE subscriptions (
    id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id      TEXT        NOT NULL,
    stripe_subscription_id  TEXT        UNIQUE NOT NULL,
    tier                    TEXT        NOT NULL CHECK (tier IN ('weekly', 'monthly', 'annual')),
    status                  TEXT        NOT NULL CHECK (status IN ('active', 'canceled', 'past_due')),
    current_period_end      TIMESTAMPTZ NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE attempts (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_id TEXT        NOT NULL,
    passed       BOOLEAN     NOT NULL,
    xp_earned    INTEGER     NOT NULL DEFAULT 0,
    hints_used   INTEGER     NOT NULL DEFAULT 0,
    time_ms      INTEGER     NOT NULL DEFAULT 0,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_progress (
    user_id     UUID    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_xp    INTEGER NOT NULL DEFAULT 0,
    level       INTEGER NOT NULL DEFAULT 1,
    streak_days INTEGER NOT NULL DEFAULT 0,
    last_active DATE,
    topic_xp    JSONB   NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_attempts_user_id      ON attempts(user_id);
CREATE INDEX idx_attempts_challenge_id ON attempts(challenge_id);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
