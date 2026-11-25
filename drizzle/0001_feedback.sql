CREATE TABLE feedback (
 id TEXT PRIMARY KEY NOT NULL,
 created_at TEXT NOT NULL,
 verdict TEXT NOT NULL,
 town_code TEXT NOT NULL,
 surface INTEGER NOT NULL,
 rooms INTEGER NOT NULL,
 estimate INTEGER NOT NULL,
 actual INTEGER
);
--> statement-breakpoint
CREATE INDEX feedback_created_idx ON feedback(created_at);
