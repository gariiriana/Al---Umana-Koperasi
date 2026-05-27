# Antigravity Python SDK Installation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permanently install and integrate the `antigravity-sdk-python` repository and python package into a dedicated virtual environment within the Antigravity IDE tools directory.

**Architecture:** Clone the repository, create a dedicated python venv (`venv_antigravity_sdk`), install both PyPI binary dependencies and editable local repository, write a TDD smoke-test to verify, and update the tools index.

**Tech Stack:** Python 3, Git, Virtualenv, Pip, PowerShell.

---

## Task 1: Repository Cloning

**Files:**

- Create: `C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\antigravity-sdk-python`

- [ ] **Step 1: Verify the directory does not exist**
  
  Run in PowerShell:

  ```powershell
  Test-Path "C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\antigravity-sdk-python"
  ```

  Expected: `False`

- [ ] **Step 2: Clone the repository**
  
  Run in PowerShell:

  ```powershell
  git clone https://github.com/google-antigravity/antigravity-sdk-python.git "C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\antigravity-sdk-python"
  ```

  Expected: Successful clone, prints repository downloading progress.

- [ ] **Step 3: Verify the repository folder exists and list contents**
  
  Run in PowerShell:

  ```powershell
  Get-ChildItem "C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\antigravity-sdk-python"
  ```

  Expected: List of files including `README.md` and standard python project configurations (e.g. `setup.py` or `pyproject.toml`).

- [ ] **Step 4: Commit clone log in active workspace**
  
  Run in active workspace (`c:\Users\Gari Iriana\OneDrive\Documents\Al umana`):

  ```powershell
  git status
  ```

  Expected: Clean or showing only untracked docs changes.

---

## Task 2: Virtual Environment Setup

**Files:**

- Create: `C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\venv_antigravity_sdk`

- [ ] **Step 1: Verify the venv folder does not exist**
  
  Run in PowerShell:

  ```powershell
  Test-Path "C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\venv_antigravity_sdk"
  ```

  Expected: `False`

- [ ] **Step 2: Create virtual environment**
  
  Run in PowerShell:

  ```powershell
  python -m venv "C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\venv_antigravity_sdk"
  ```

  Expected: Success with no errors.

- [ ] **Step 3: Verify venv folder exists and Python executable is present**
  
  Run in PowerShell:

  ```powershell
  Test-Path "C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\venv_antigravity_sdk\Scripts\python.exe"
  ```

  Expected: `True`

---

## Task 3: Package Installation & TDD Smoke-Testing

**Files:**

- Create: `C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\verify_antigravity_sdk.py`

- [ ] **Step 1: Write a failing smoke-test script**
  
  Create the verification script `C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\verify_antigravity_sdk.py` with the following content:

  ```python
  import sys

  try:
      import antigravity
      print("SUCCESS: antigravity package imported successfully!")
      print("Package Location:", antigravity.__file__)
      sys.exit(0)
  except ImportError as e:
      print("FAIL: Could not import antigravity package.", file=sys.stderr)
      print("Error:", e, file=sys.stderr)
      sys.exit(1)
  ```

- [ ] **Step 2: Run the test to verify it fails**
  
  Run in PowerShell using the new virtual environment python:

  ```powershell
  & "C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\venv_antigravity_sdk\Scripts\python.exe" "C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\verify_antigravity_sdk.py"
  ```

  Expected: `FAIL: Could not import antigravity package.` with Exit Code 1.

- [ ] **Step 3: Upgrade pip and install standard PyPI binaries & editable SDK**
  
  Run in PowerShell to upgrade pip:

  ```powershell
  & "C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\venv_antigravity_sdk\Scripts\python.exe" -m pip install --upgrade pip
  ```

  Run in PowerShell to install PyPI binaries:

  ```powershell
  & "C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\venv_antigravity_sdk\Scripts\pip.exe" install google-antigravity
  ```

  Run in PowerShell to install local package in editable mode:

  ```powershell
  & "C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\venv_antigravity_sdk\Scripts\pip.exe" install -e "C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\antigravity-sdk-python"
  ```

  Expected: All installations succeed with exit code 0.

- [ ] **Step 4: Run the test to verify it passes**
  
  Run in PowerShell:

  ```powershell
  & "C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\venv_antigravity_sdk\Scripts\python.exe" "C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\verify_antigravity_sdk.py"
  ```

  Expected: `SUCCESS: antigravity package imported successfully!` with Exit Code 0.

---

## Task 4: Tools Index Integration

**Files:**

- Modify: `C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\tools_index.md`

- [ ] **Step 1: Read existing tools_index.md content**
  
  Read lines 45-52 of `C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\tools_index.md` to identify the insert location.

- [ ] **Step 2: Update tools_index.md**
  
  Modify the file to append section 6 for `antigravity-sdk-python`:

  ````markdown
  ## 6. antigravity-sdk-python (Google Antigravity SDK)
  * **Location:** `C:\Users\Gari Iriana\.gemini\antigravity\scratch\tools\antigravity-sdk-python`
  * **Purpose:** Programmatic access to the same agent runtime and harness that powers Google's "Antigravity" AI coding platform and CLI.
  * **How to Use:**
    Activate the venv and run Python commands using the SDK:
    ```powershell
    & "C:\Users\Gari Iriana\.gemini\antigravity\scratch\tools\venv_antigravity_sdk\Scripts\Activate.ps1"
    ```
  ````

- [ ] **Step 3: Verify the modified tools_index.md**
  
  Read the end of `C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\tools_index.md` to ensure formatting and contents are complete and perfectly aligned.
