## Summary

```text
Published desktop ZIP -> SHA-256 cask -> brew install / upgrade
```

Update the Sector 7 Homebrew cask to the versioned desktop release built from main. The cask installs the Apple silicon app and quits it during uninstall or upgrade. User data remains on disk.

## Evidence

- Before: the previous cask version, or no cask on the first release.
- After: the cask points to the newly published ZIP and its SHA-256 checksum. The build job passed the web quality gate, desktop checks and package signature verification.
- Hosted Homebrew installation still needs verification after this PR is merged.

## Merge Danger

**Door:** two-way

**Blast Radius:** desktop

Downloaded apps use ad-hoc signing and may require macOS approval. Cask uninstall does not delete workspace data.
