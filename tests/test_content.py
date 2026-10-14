import random
from urllib.parse import unquote, urlparse

from app.content import DATA_DIR, BlessingPicker, load_json


def test_blessings_select_supplied_goddesses_without_consecutive_repeats():
    picker = BlessingPicker()
    goddesses = load_json("goddesses.json")
    rng = random.Random(91)
    choices = [picker.pick(goddesses, rng) for _ in range(20)]

    assert all(first["name"] != second["name"] for first, second in zip(choices, choices[1:]))
    assert {goddess["name"] for goddess in choices} == {goddess["name"] for goddess in goddesses}
    for goddess in goddesses:
        image_path = DATA_DIR.parent / "images" / unquote(urlparse(goddess["image"]).path).removeprefix("/images/")
        assert image_path.is_file()
        assert goddess["quote"]


def test_question_bank_has_fifteen_per_difficulty_and_five_per_form():
    questions = load_json("questions.json")
    assert len(questions) >= 45
    for difficulty in ("Easy", "Moderate", "Difficult"):
        assert sum(q["difficulty"] == difficulty for q in questions) == 15
    for goddess in {q["goddess"] for q in questions}:
        assert sum(q["goddess"] == goddess for q in questions) == 5
