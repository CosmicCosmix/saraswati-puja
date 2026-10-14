import random
from urllib.parse import unquote, urlparse

from app.content import DATA_DIR, BlessingPicker, load_json, shuffle_question_options


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


def test_question_bank_has_unique_questions_and_explicit_answers():
    questions = load_json("questions.json")
    assert len(questions) == 63
    assert len({question["id"] for question in questions}) == len(questions)
    assert len({question["text"] for question in questions}) == len(questions)
    for difficulty in ("Easy", "Moderate", "Difficult"):
        assert sum(q["difficulty"] == difficulty for q in questions) == 21
    for question in questions:
        assert len(question["text"]) <= 140
        assert len(question["reason"]) <= 120
        assert len(question["options"]) == 4
        assert len(set(question["options"])) == 4
        assert all(len(option) <= 40 for option in question["options"])
        assert isinstance(question["correct_index"], int)
        assert not isinstance(question["correct_index"], bool)
        assert 0 <= question["correct_index"] < len(question["options"])
        assert question["reason"]


def test_shuffled_options_keep_correct_answer_mapping():
    question = load_json("questions.json")[0]
    expected_answer = question["options"][question["correct_index"]]
    displayed_questions = [
        shuffle_question_options(question, random.Random(seed))
        for seed in range(100)
    ]

    assert {item["correct_index"] for item in displayed_questions} == {0, 1, 2, 3}
    for displayed in displayed_questions:
        assert set(displayed["options"]) == set(question["options"])
        assert displayed["options"][displayed["correct_index"]] == expected_answer
    assert question["options"][question["correct_index"]] == expected_answer
