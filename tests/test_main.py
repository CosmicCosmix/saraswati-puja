from __future__ import annotations

import asyncio
from types import SimpleNamespace
from xml.etree import ElementTree

import pytest
from fastapi import HTTPException
from starlette.requests import Request

import app.main as main_module
from app.main import camera_status, capture_player_name, goddess_image
from app.state import QuizState


def test_missing_goddess_image_uses_original_illustration():
    response = asyncio.run(goddess_image("01_shailaputri.png"))
    image = response.body.decode("utf-8")
    illustration = ElementTree.fromstring(image)

    assert response.media_type == "image/svg+xml"
    assert illustration.tag == "{http://www.w3.org/2000/svg}svg"
    assert "<title id=\"title\">Goddess Shailaputri</title>" in image
    assert "Add your supplied image here" not in image


def test_goddess_image_rejects_unknown_filename():
    with pytest.raises(HTTPException) as error:
        asyncio.run(goddess_image("unknown.png"))

    assert error.value.status_code == 404


def test_post_quiz_screen_route_is_registered():
    assert any(route.path == "/postkiosk.html" for route in main_module.app.routes)


def test_post_quiz_screen_renders_join_hands_and_blessing_views():
    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.3"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/postkiosk.html",
        "raw_path": b"/postkiosk.html",
        "query_string": b"",
        "headers": [],
        "client": ("testclient", 50000),
        "server": ("testserver", 80),
    }
    response = asyncio.run(main_module.post_kiosk(Request(scope)))

    assert response.status_code == 200
    assert b"Join your hands" in response.body
    assert b"blessing-screen" in response.body


def test_camera_status_reports_worker_state(monkeypatch):
    monkeypatch.setattr(main_module, "camera", SimpleNamespace(status="Camera connected"))

    response = asyncio.run(camera_status())

    assert response == {"status": "Camera connected"}


def test_browser_name_endpoint_saves_recognized_name(isolated_db, monkeypatch):
    quiz_state = QuizState(simulate=True)
    monkeypatch.setattr(main_module, "state", quiz_state)

    response = asyncio.run(capture_player_name(main_module.PlayerName(name="  maya! kumari  ")))

    assert response == {"name": "Maya Kumari"}
    assert quiz_state.player == "Maya Kumari"


def test_browser_name_endpoint_rejects_name_outside_name_screen(isolated_db, monkeypatch):
    quiz_state = QuizState(simulate=True)
    quiz_state.accept_name("Maya")
    quiz_state.handle_gesture("count", count=1)
    monkeypatch.setattr(main_module, "state", quiz_state)

    with pytest.raises(HTTPException) as error:
        asyncio.run(capture_player_name(main_module.PlayerName(name="Another Name")))

    assert error.value.status_code == 400
