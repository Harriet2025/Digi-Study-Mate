-- Study Mate MySQL schema. Generated from app/models.py by scripts/init_db.py; don't edit by hand.

CREATE DATABASE IF NOT EXISTS study_mate CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE study_mate;

CREATE TABLE documents (
	id VARCHAR(36) NOT NULL, 
	filename VARCHAR(255) NOT NULL, 
	mime_type VARCHAR(127) NOT NULL, 
	source_type ENUM('pdf','pptx') NOT NULL, 
	byte_size INTEGER NOT NULL, 
	page_count INTEGER NOT NULL, 
	chunk_count INTEGER NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT (now()), 
	PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE study_events (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	kind ENUM('listen','review','defense','upload','quiz','chat') NOT NULL, 
	ref_id VARCHAR(64), 
	amount FLOAT NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_study_events_created_at ON study_events (created_at);

CREATE TABLE defense_question_sets (
	id VARCHAR(36) NOT NULL, 
	document_id VARCHAR(36), 
	source_title VARCHAR(300), 
	overall_weaknesses JSON NOT NULL, 
	ai_model VARCHAR(100) NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT (now()), 
	PRIMARY KEY (id), 
	FOREIGN KEY(document_id) REFERENCES documents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_defense_question_sets_document_id ON defense_question_sets (document_id);

CREATE TABLE document_chunks (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	document_id VARCHAR(36) NOT NULL, 
	chunk_index INTEGER NOT NULL, 
	content MEDIUMTEXT NOT NULL, 
	token_count INTEGER NOT NULL, 
	page_start INTEGER NOT NULL, 
	page_end INTEGER NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT (now()), 
	PRIMARY KEY (id), 
	CONSTRAINT uq_chunk_position UNIQUE (document_id, chunk_index), 
	FOREIGN KEY(document_id) REFERENCES documents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_document_chunks_document_id ON document_chunks (document_id);

CREATE TABLE study_guides (
	id VARCHAR(36) NOT NULL, 
	document_id VARCHAR(36) NOT NULL, 
	title VARCHAR(300) NOT NULL, 
	page_start INTEGER, 
	page_end INTEGER, 
	level ENUM('beginner','intermediate','advanced') NOT NULL, 
	language VARCHAR(10) NOT NULL, 
	overview TEXT, 
	objectives JSON NOT NULL, 
	status ENUM('queued','processing','ready','failed') NOT NULL, 
	stage VARCHAR(30) NOT NULL, 
	progress SMALLINT NOT NULL, 
	error_message VARCHAR(500), 
	ai_model VARCHAR(100) NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT (now()), 
	PRIMARY KEY (id), 
	FOREIGN KEY(document_id) REFERENCES documents (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_study_guides_document_id ON study_guides (document_id);

CREATE TABLE chat_messages (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	guide_id VARCHAR(36) NOT NULL, 
	`role` ENUM('user','assistant') NOT NULL, 
	content MEDIUMTEXT NOT NULL, 
	pages JSON NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT (now()), 
	PRIMARY KEY (id), 
	FOREIGN KEY(guide_id) REFERENCES study_guides (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_chat_messages_guide_id ON chat_messages (guide_id);

CREATE TABLE defense_questions (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	set_id VARCHAR(36) NOT NULL, 
	question_key VARCHAR(8) NOT NULL, 
	position SMALLINT NOT NULL, 
	question TEXT NOT NULL, 
	category ENUM('logical_gap','methodology','assumption','evidence','limitations','technical_depth') NOT NULL, 
	targets_weakness TEXT NOT NULL, 
	source_reference VARCHAR(200) NOT NULL, 
	rubric JSON NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_question_key UNIQUE (set_id, question_key), 
	FOREIGN KEY(set_id) REFERENCES defense_question_sets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_defense_questions_set_id ON defense_questions (set_id);

CREATE TABLE episodes (
	id VARCHAR(36) NOT NULL, 
	document_id VARCHAR(36), 
	title VARCHAR(300) NOT NULL, 
	page_start INTEGER, 
	page_end INTEGER, 
	target_minutes SMALLINT NOT NULL, 
	total_duration_sec FLOAT NOT NULL, 
	ai_model VARCHAR(100) NOT NULL, 
	tts_provider VARCHAR(50) NOT NULL, 
	style ENUM('standard','recap','deep_dive','exam_cram') NOT NULL DEFAULT 'standard', 
	level ENUM('beginner','intermediate','advanced') NOT NULL DEFAULT 'intermediate', 
	language VARCHAR(10) NOT NULL DEFAULT 'en', 
	guide_id VARCHAR(36), 
	status ENUM('queued','processing','ready','failed') NOT NULL DEFAULT 'ready', 
	stage VARCHAR(30) NOT NULL DEFAULT 'done', 
	progress SMALLINT NOT NULL DEFAULT '100', 
	error_message VARCHAR(500), 
	created_at DATETIME NOT NULL DEFAULT (now()), 
	PRIMARY KEY (id), 
	FOREIGN KEY(document_id) REFERENCES documents (id) ON DELETE SET NULL, 
	FOREIGN KEY(guide_id) REFERENCES study_guides (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_episodes_document_id ON episodes (document_id);

CREATE INDEX ix_episodes_guide_id ON episodes (guide_id);

CREATE TABLE guide_resources (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	guide_id VARCHAR(36) NOT NULL, 
	position SMALLINT NOT NULL, 
	kind ENUM('video','video_search','reading') NOT NULL, 
	title VARCHAR(300) NOT NULL, 
	url VARCHAR(600) NOT NULL, 
	description TEXT, 
	source VARCHAR(100), 
	thumbnail_url VARCHAR(600), 
	PRIMARY KEY (id), 
	FOREIGN KEY(guide_id) REFERENCES study_guides (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_guide_resources_guide_id ON guide_resources (guide_id);

CREATE TABLE guide_sections (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	guide_id VARCHAR(36) NOT NULL, 
	position SMALLINT NOT NULL, 
	title VARCHAR(300) NOT NULL, 
	explanation MEDIUMTEXT NOT NULL, 
	analogy TEXT, 
	example TEXT, 
	key_terms JSON NOT NULL, 
	diagram TEXT, 
	diagram_caption VARCHAR(300), 
	check_question TEXT, 
	check_answer TEXT, 
	source_pages VARCHAR(50), 
	PRIMARY KEY (id), 
	FOREIGN KEY(guide_id) REFERENCES study_guides (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_guide_sections_guide_id ON guide_sections (guide_id);

CREATE TABLE projects (
	id VARCHAR(36) NOT NULL, 
	title VARCHAR(300) NOT NULL, 
	course VARCHAR(300), 
	requirements MEDIUMTEXT NOT NULL, 
	source_filename VARCHAR(255), 
	slide_count SMALLINT NOT NULL, 
	duration_minutes SMALLINT NOT NULL, 
	deck JSON, 
	defense JSON, 
	pptx_path VARCHAR(255), 
	question_set_id VARCHAR(36), 
	status ENUM('queued','processing','ready','failed') NOT NULL, 
	stage VARCHAR(30) NOT NULL, 
	progress SMALLINT NOT NULL, 
	error_message VARCHAR(500), 
	ai_model VARCHAR(100) NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT (now()), 
	PRIMARY KEY (id), 
	FOREIGN KEY(question_set_id) REFERENCES defense_question_sets (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quiz_attempts (
	id VARCHAR(36) NOT NULL, 
	guide_id VARCHAR(36) NOT NULL, 
	answers JSON NOT NULL, 
	score SMALLINT NOT NULL, 
	rating VARCHAR(30) NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT (now()), 
	PRIMARY KEY (id), 
	FOREIGN KEY(guide_id) REFERENCES study_guides (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_quiz_attempts_guide_id ON quiz_attempts (guide_id);

CREATE TABLE quiz_questions (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	guide_id VARCHAR(36) NOT NULL, 
	position SMALLINT NOT NULL, 
	question TEXT NOT NULL, 
	options JSON NOT NULL, 
	correct_index SMALLINT NOT NULL, 
	explanation TEXT NOT NULL, 
	difficulty ENUM('easy','medium','hard') NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(guide_id) REFERENCES study_guides (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_quiz_questions_guide_id ON quiz_questions (guide_id);

CREATE TABLE defense_attempts (
	id VARCHAR(36) NOT NULL, 
	question_id INTEGER NOT NULL, 
	answer_text TEXT NOT NULL, 
	input_mode ENUM('typed','spoken') NOT NULL, 
	score SMALLINT NOT NULL, 
	grade ENUM('excellent','good','partial','insufficient') NOT NULL, 
	evaluation JSON NOT NULL, 
	created_at DATETIME NOT NULL DEFAULT (now()), 
	PRIMARY KEY (id), 
	FOREIGN KEY(question_id) REFERENCES defense_questions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_defense_attempts_question_id ON defense_attempts (question_id);

CREATE TABLE episode_segments (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	episode_id VARCHAR(36) NOT NULL, 
	segment_index INTEGER NOT NULL, 
	line_index INTEGER NOT NULL, 
	speaker ENUM('Alex','Sam') NOT NULL, 
	line_type ENUM('dialogue','quiz_checkpoint') NOT NULL, 
	text TEXT NOT NULL, 
	file_path VARCHAR(255) NOT NULL, 
	start_sec FLOAT NOT NULL, 
	end_sec FLOAT NOT NULL, 
	duration_sec FLOAT NOT NULL, 
	pause_after_sec FLOAT NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_segment_position UNIQUE (episode_id, segment_index), 
	FOREIGN KEY(episode_id) REFERENCES episodes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_episode_segments_episode_id ON episode_segments (episode_id);

CREATE TABLE flashcards (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	episode_id VARCHAR(36), 
	guide_id VARCHAR(36), 
	front TEXT NOT NULL, 
	back TEXT NOT NULL, 
	source ENUM('checkpoint','generated') NOT NULL, 
	ease FLOAT NOT NULL, 
	interval_days FLOAT NOT NULL, 
	repetitions INTEGER NOT NULL, 
	lapses INTEGER NOT NULL, 
	due_at DATETIME NOT NULL, 
	last_reviewed_at DATETIME, 
	created_at DATETIME NOT NULL DEFAULT (now()), 
	PRIMARY KEY (id), 
	FOREIGN KEY(episode_id) REFERENCES episodes (id) ON DELETE CASCADE, 
	FOREIGN KEY(guide_id) REFERENCES study_guides (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX ix_flashcards_due_at ON flashcards (due_at);

CREATE INDEX ix_flashcards_episode_id ON flashcards (episode_id);

CREATE INDEX ix_flashcards_guide_id ON flashcards (guide_id);

CREATE TABLE listening_progress (
	episode_id VARCHAR(36) NOT NULL, 
	position_sec FLOAT NOT NULL, 
	listened_sec FLOAT NOT NULL, 
	completed BOOL NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (episode_id), 
	FOREIGN KEY(episode_id) REFERENCES episodes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
