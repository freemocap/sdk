# References

Register external implementation and architecture sources in root `references.bib` and cite their stable keys beside supported claims as `[@key]`. Include `title`, `url`, `urldate`, `review` and `claim` fields. Record the actual scope reviewed; access date is not publication date. Internal source extraction provenance lives separately in `provenance/`.

Run `python tools/check_references.py` when citations change. This check validates required metadata and citation-key resolution; it does not establish the truth of a source's claims.
