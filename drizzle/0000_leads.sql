CREATE TABLE leads (
 id TEXT PRIMARY KEY NOT NULL,
 requester_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 name TEXT NOT NULL,
 email TEXT NOT NULL DEFAULT '',
 phone TEXT NOT NULL DEFAULT '',
 role TEXT NOT NULL DEFAULT 'proprietaire',
 timeline TEXT NOT NULL DEFAULT 'a_definir',
 message TEXT NOT NULL DEFAULT '',
 property_json TEXT NOT NULL DEFAULT '{}',
 consent_at TEXT NOT NULL,
 consent_version TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'nouveau',
 notes TEXT NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE INDEX leads_created_idx ON leads(created_at);
--> statement-breakpoint
CREATE INDEX leads_requester_created_idx ON leads(requester_id, created_at);
--> statement-breakpoint
CREATE INDEX leads_status_idx ON leads(status);
