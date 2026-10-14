from pathlib import Path

import run


def test_physical_mode_restarts_with_project_python311(monkeypatch):
    monkeypatch.setattr(run.sys, "version_info", (3, 14, 0))
    monkeypatch.setattr(run.sys, "argv", ["run.py", "--port", "9000"])
    monkeypatch.setattr(Path, "is_file", lambda _path: True)
    restarted = {}

    def record_execv(executable, args):
        restarted["executable"] = executable
        restarted["args"] = args

    monkeypatch.setattr(run.os, "execv", record_execv)

    run._restart_with_camera_python(simulate=False)

    executable = str(Path(run.__file__).resolve().parent / ".venv311" / "Scripts" / "python.exe")
    assert restarted == {
        "executable": executable,
        "args": [executable, str(Path(run.__file__).resolve()), "--port", "9000"],
    }


def test_simulation_does_not_restart_with_python311(monkeypatch):
    monkeypatch.setattr(run.sys, "version_info", (3, 14, 0))

    def unexpected_restart(*_args):
        raise AssertionError("simulation mode should not restart")

    monkeypatch.setattr(run.os, "execv", unexpected_restart)

    run._restart_with_camera_python(simulate=True)


def test_python311_does_not_restart(monkeypatch):
    monkeypatch.setattr(run.sys, "version_info", (3, 11, 9))

    def unexpected_restart(*_args):
        raise AssertionError("Python 3.11 should not restart")

    monkeypatch.setattr(run.os, "execv", unexpected_restart)

    run._restart_with_camera_python(simulate=False)
