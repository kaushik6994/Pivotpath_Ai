"""Package an explicitly browser-local demo and the complete Python source."""
from pathlib import Path
import argparse
import shutil
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIRS = ("backend", "web", "scripts", "docs", "tests", "examples", ".vscode", ".github")
SOURCE_FILES = ("README.md", "requirements.txt", "package.json", ".gitignore", ".env.example")
SOURCE_SUFFIXES = {".py", ".js", ".mjs", ".html", ".css", ".json", ".md", ".txt", ".yml", ".yaml", ".sh", ".bat", ".svg", ".png", ".woff2", ".ttf"}


def safe_source(path):
    relative = path.relative_to(ROOT)
    excluded = {"__pycache__", ".pytest_cache", "data", "data-private", "runtime", "uploads", ".venv", "node_modules"}
    return (path.is_file() and not path.is_symlink()
            and ROOT in path.resolve().parents
            and not any(part in excluded or part.startswith('.env') for part in relative.parts)
            and path.suffix.lower() in SOURCE_SUFFIXES)


def source_files():
    for name in SOURCE_FILES:
        path = ROOT / name
        if path.is_file():
            yield path
    for name in SOURCE_DIRS:
        for path in sorted((ROOT / name).rglob("*")):
            if safe_source(path):
                yield path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    args = parser.parse_args()
    output = args.output.resolve()
    if output == ROOT or output in ROOT.parents or output == ROOT / "web":
        raise SystemExit("Choose a separate build directory.")
    output.mkdir(parents=True, exist_ok=True)
    for source in (ROOT / "web").rglob("*"):
        if safe_source(source):
            target = output / source.relative_to(ROOT / "web")
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    (output / "config.js").write_text("window.ATLAS_HOSTED_DEMO = true;\n", encoding="utf-8")
    archive = output / "atlas-source.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as bundle:
        for source in source_files():
            bundle.write(source, Path("pivotpath-atlas") / source.relative_to(ROOT))
    print(f"Browser demo: {output}")
    print(f"Python source: {archive}")


if __name__ == "__main__":
    main()
