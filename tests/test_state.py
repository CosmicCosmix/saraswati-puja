from __future__ import annotations

import time
import random

import pytest

from app.content import load_json, shuffle_question_options
from app.models import AppSetting, QuizSession
from app.state import QuizState


def test_simulated_session_transitions_through_blessing(isolated_db):
    state = QuizState(simulate=True)
    assert state.state == "NAME"
    state.handle_gesture("count", count=5)
    assert state.state == "NAME"
    assert state.accept_name("Test Visitor") == "Test Visitor"
    state.handle_gesture("count", count=1)
    assert state.state == "READY"
    state.handle_gesture("count", count=1)
    assert state.state == "QUESTION"
    assert len(state.questions) == 3
    assert state.payload["total"] == 3
    assert len({question["id"] for question in state.questions}) == 3
    for _ in range(3):
        current = state.questions[state.question_index]
        state.handle_gesture("count", count=current["correct_index"] + 1)
        assert state.state == "FEEDBACK"
        state.tick(state.feedback_deadline + 0.01)
        assert state.state == "FEEDBACK"
        state.tick(state.feedback_deadline + 4.01)
    assert state.state == "RESULTS"
    assert len(state.answers) == 3
    assert state.payload["score"] == sum(answer["points"] for answer in state.answers)
    assert state.get_leaderboard()[0]["name"] == "Test Visitor"
    state.tick(state.deadline + 0.01)
    assert state.state == "PRAYER"
    state.handle_gesture("namaste")
    assert state.state == "BLESSING"
    assert state.payload["name"] == "Test Visitor"
    assert state.payload["image"].startswith("/images/")
    assert state.payload["goddess"]
    goddess = next(entry for entry in load_json("goddesses.json") if entry["name"] == state.payload["goddess"])
    assert state.payload["image"] == goddess["image"]
    assert state.payload["slogan"] == goddess["quote"]
    state.tick(state.deadline + 0.01)
    assert state.state == "NAME"


def test_question_selection_samples_three_unique_questions_from_pool(isolated_db):
    state = QuizState(simulate=True)
    pool = load_json("questions.json")

    selected = state._choose_questions()

    assert len(selected) == 3
    assert len({question["id"] for question in selected}) == 3
    assert {question["id"] for question in selected} <= {question["id"] for question in pool}

    next_selected = state._choose_questions()
    assert len(next_selected) == 3
    assert len({question["id"] for question in next_selected}) == 3
    assert {question["id"] for question in next_selected} <= {question["id"] for question in pool}


def test_answer_scoring_and_feedback_follow_shuffled_correct_option(isolated_db):
    state = QuizState(simulate=True)
    source_question = load_json("questions.json")[0]
    correct_positions = set()

    for seed in range(100):
        question = shuffle_question_options(source_question, random.Random(seed))
        correct_index = question["correct_index"]
        if correct_index in correct_positions:
            continue
        correct_positions.add(correct_index)
        state.questions = [question]
        state.question_index = 0
        state.state = "QUESTION"
        state.selected_answer = None
        state.answers = []
        state.answer_started = time.monotonic()
        state.payload = {
            "options": question["options"],
            "difficulty": question["difficulty"],
            "question": question["text"],
        }

        state.handle_gesture("count", count=correct_index + 1)
        assert state.answers[-1]["correct"] is True
        assert state.answers[-1]["points"] > 0
        state.tick(state.feedback_deadline + 0.01)
        assert state.payload["correct"] is True
        assert state.payload["correct_index"] == correct_index
        assert state.payload["options"][correct_index] == source_question["options"][source_question["correct_index"]]

        wrong_index = (correct_index + 1) % 4
        state.questions = [question]
        state.question_index = 0
        state.state = "QUESTION"
        state.selected_answer = None
        state.answers = []
        state.answer_started = time.monotonic()
        state.handle_gesture("count", count=wrong_index + 1)
        assert state.answers[-1]["correct"] is False
        assert state.answers[-1]["points"] == 0
        if len(correct_positions) == 4:
            break

    assert correct_positions == {0, 1, 2, 3}


def test_namaste_keeps_blessing_unchanged_until_a_new_prayer(isolated_db):
    state = QuizState(simulate=True)
    state.player = "Test Visitor"
    state.state = "PRAYER"

    state.handle_gesture("namaste")
    first_blessing = dict(state.payload)

    state.handle_gesture("namaste", locked=False)
    assert state.payload == first_blessing

    state.handle_gesture("count", count=None, locked=False)
    state.handle_gesture("namaste")
    assert state.payload["goddess"] != first_blessing["goddess"]


def test_prayer_entry_rearms_namaste_detection(isolated_db):
    state = QuizState(simulate=True)
    state.state = "RESULTS"
    state.deadline = time.monotonic() - 1
    reset_count = 0

    def reset_namaste_lock():
        nonlocal reset_count
        reset_count += 1

    state.set_namaste_reset(reset_namaste_lock)
    state.tick()

    assert state.state == "PRAYER"
    assert reset_count == 1


def test_name_confirmation_requires_ready_gesture_to_start(isolated_db):
    state = QuizState(simulate=True)
    state.accept_name("Test Visitor")
    state.handle_gesture("count", count=2)

    assert state.state == "NAME"
    assert state.player == ""
    assert state.payload["prompt"] == "Please say your name"

    state.accept_name("Test Visitor")
    state.handle_gesture("count", count=1)

    assert state.state == "READY"
    assert "Ready to take the quiz" in state.payload["prompt"]
    state.handle_gesture("count", count=1)
    assert state.state == "QUESTION"
    assert state.payload["number"] == 1


def test_declining_ready_prompt_returns_to_name_capture(isolated_db):
    state = QuizState(simulate=True)
    state.accept_name("Test Visitor")
    state.handle_gesture("count", count=1)
    assert state.state == "READY"

    state.handle_gesture("count", count=2)

    assert state.state == "NAME"
    assert state.player == ""
    assert state.payload["prompt"] == "Please say your name"


def test_name_gesture_callback_publishes_release_guidance_and_retries_reset_lock(isolated_db):
    state = QuizState(simulate=True)
    reset_count = 0

    def reset_gesture_lock():
        nonlocal reset_count
        reset_count += 1

    state.set_gesture_reset(reset_gesture_lock)
    state.accept_name("Test Visitor")
    state.handle_gesture("count", count=5, locked=True)
    assert state.state == "NAME"

    state.handle_gesture("count", count=2, locked=True)
    assert reset_count == 1
    assert state.state == "NAME"
    assert state.player == ""

    state.handle_gesture("count", count=2, locked=False, awaiting_release=True)
    assert state.snapshot()["gesture"]["awaiting_release"]


def test_name_is_sanitized_and_idle_resets(isolated_db):
    state = QuizState(simulate=True)
    assert state.accept_name("  maya! kumari  ") == "Maya Kumari"
    state.last_activity = time.monotonic() - 61
    state.tick()
    assert state.state == "NAME"


def test_name_retry_never_invents_a_player(isolated_db):
    state = QuizState(simulate=True)

    for _ in range(3):
        state._retry_name()

    assert state.state == "NAME"
    assert state.player == ""
    assert "Devotee" not in state.payload.get("name", "")
    with pytest.raises(RuntimeError, match="confirmed player name"):
        state._finish_quiz()
    assert state.get_leaderboard() == []


def test_physical_name_screen_waits_for_browser_microphone_input(isolated_db):
    state = QuizState(simulate=False)
    state.tick()

    assert state.state == "NAME"
    assert state.player == ""
    assert "listening" not in state.payload


def test_legacy_generated_names_are_not_shown_on_leaderboard(isolated_db):
    with isolated_db() as db:
        db.add(QuizSession(name="Devotee 1", score=20, answer_time=12))
        db.commit()

    state = QuizState(simulate=True)

    assert state.get_leaderboard() == []


def test_old_default_gesture_settings_migrate_to_responsive_defaults(isolated_db):
    with isolated_db() as db:
        db.add_all(
            [
                AppSetting(key="confidence_threshold", value="0.75"),
                AppSetting(key="hold_ms", value="800"),
                AppSetting(key="vote_frames", value="15"),
            ]
        )
        db.commit()

    state = QuizState(simulate=True)

    assert state.settings["confidence_threshold"] == 0.65
    assert state.settings["hold_ms"] == 600
    assert state.settings["vote_frames"] == 8
