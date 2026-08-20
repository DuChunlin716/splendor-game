import os, pathlib
p = pathlib.Path(os.getcwd()) / ".dsh" / "tools" / "probe.txt"
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text("hello", encoding="utf-8")
print("wrote", p)
print("cwd", os.getcwd())
