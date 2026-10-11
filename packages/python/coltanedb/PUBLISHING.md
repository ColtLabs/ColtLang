# Publishing `coltanedb` to PyPI

This guide covers building, verifying, and publishing the official **`coltanedb`** Python SDK to PyPI and TestPyPI.

---

## 1. Prerequisites

Ensure you have Python 3.8+ and packaging tools installed:

```bash
py -m pip install --upgrade build twine
```

---

## 2. Clean and Build Distributions

From the `packages/python/coltanedb` directory:

```bash
# Clean previous build artifacts if needed
Remove-Item -Recurse -Force dist, build -ErrorAction SilentlyContinue

# Build source distribution (.tar.gz) and binary wheel (.whl)
py -m build
```

This generates:
- `dist/coltanedb-0.1.0-py3-none-any.whl`
- `dist/coltanedb-0.1.0.tar.gz`

---

## 3. Validate Artifacts

Run `twine check` to ensure the metadata and README render properly according to PyPI standards:

```bash
py -m twine check dist/*
```

Expected output:
```text
Checking dist/coltanedb-0.1.0-py3-none-any.whl: PASSED
Checking dist/coltanedb-0.1.0.tar.gz: PASSED
```

---

## 4. Test on TestPyPI (Recommended First Step)

TestPyPI allows you to verify upload and test installation in a sandbox environment before touching production PyPI.

1. Create an account at [test.pypi.org](https://test.pypi.org/) and generate an API token (`pypi-...`).
2. Upload using Twine:

```bash
py -m twine upload --repository testpypi dist/*
```

When prompted:
- **Username**: `__token__`
- **Password**: Your TestPyPI API token (starts with `pypi-`)

3. Verify installation from TestPyPI:

```bash
py -m pip install --index-url https://test.pypi.org/simple/ --no-deps coltanedb
```

---

## 5. Publish to Production PyPI

### Option A: From Terminal with Twine

1. Create an API token at [pypi.org/manage/account/token/](https://pypi.org/manage/account/token/) with scope `Entire account` (for first upload) or `Project: coltanedb` (for subsequent uploads).
2. Upload distributions:

```bash
py -m twine upload dist/*
```

When prompted:
- **Username**: `__token__`
- **Password**: Your PyPI API token (`pypi-...`)

Alternatively, configure your environment variables:
```powershell
$env:TWINE_USERNAME = "__token__"
$env:TWINE_PASSWORD = "pypi-your-token-here"
py -m twine upload dist/*
```

---

### Option B: Automated via GitHub Actions (Trusted Publishing)

The repository includes [`.github/workflows/publish-pypi.yml`](../../.github/workflows/publish-pypi.yml) using PyPI OpenID Connect (OIDC) Trusted Publishing (no secrets required):

1. Go to [PyPI Publishing Management](https://pypi.org/manage/account/publishing/).
2. Add a new **GitHub publisher**:
   - **PyPI Project Name**: `coltanedb`
   - **Owner**: `itsjustayush`
   - **Repository name**: `ColtaneDB`
   - **Workflow name**: `publish-pypi.yml`
3. Trigger the workflow:
   - Either publish a new GitHub Release (e.g. tag `v0.1.0`), OR
   - Navigate to **Actions** &rarr; **Publish Python Package to PyPI** &rarr; **Run workflow**.

---

## 6. Verify Production Installation

Once published, developers worldwide can install:

```bash
pip install coltanedb
```

And verify in Python:

```python
import coltanedb
from coltanedb import ColtaneClient

print(coltanedb.__version__)
client = ColtaneClient(api_key="clt_live_demo")
```
