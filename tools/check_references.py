from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
entries = re.findall(r"@\w+\{([^,]+),\n(.*?)\n\}", (root / "references.bib").read_text(), re.S)
keys = set()
for key, body in entries:
    assert key not in keys, f"Duplicate reference: {key}"
    keys.add(key)
    for field in ("title", "url", "urldate", "review", "claim"):
        assert re.search(rf"\b{field}\s*=\s*\{{[^}}]+\}}", body), f"Missing {field}: {key}"
for folder in (root / "packages/server/freemocap_sdk", root / "packages/desktop"):
    for path in folder.rglob("*"):
        if "target" in path.parts or path.suffix not in (".py", ".rs", ".md"):
            continue
        for citation in re.findall(r"\[@[^\]]+\]", path.read_text(encoding="utf-8")):
            for key in re.findall(r"@([A-Za-z][A-Za-z0-9]+)", citation):
                assert key in keys, f"Unknown reference {key}: {path}"
print(f"Validated {len(keys)} references and implementation citation keys")
