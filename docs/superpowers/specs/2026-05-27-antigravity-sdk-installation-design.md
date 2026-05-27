# Design Spec: Installation and Integration of Antigravity Python SDK

## Status: 📝 PROPOSED

## 1. Goal Description
The objective of this design is to clone and permanently install the `google-antigravity/antigravity-sdk-python` repository as an integrated developer tool inside the Antigravity IDE (`C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools`). The SDK will be set up inside a dedicated python virtual environment (`venv_antigravity_sdk`) and registered in the `tools_index.md` so that the IDE and Gari can access its full programmatic capabilities (Agent loop, custom tools, MCP integration, safety hooks, etc.).

---

## 2. Architecture & Directory Structure
We will follow the established modular structure in the tools directory:

```
C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\
├── awesome-subagents/
├── security-review/
├── superpowers/
├── agent-projects/
├── venv_repoagent/
├── antigravity-sdk-python/            <-- [NEW] Cloned repository containing SDK source, examples, and tools
├── venv_antigravity_sdk/               <-- [NEW] Dedicated virtual environment with all required packages
└── tools_index.md                     <-- [MODIFIED] Registered entry for Antigravity SDK
```

---

## 3. Implementation Steps

### Phase 1: Repository Cloning
- Clone the target git repository into the tools directory:
  ```powershell
  git clone https://github.com/google-antigravity/antigravity-sdk-python.git "C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\antigravity-sdk-python"
  ```

### Phase 2: Virtual Environment Setup
- Create a Python virtual environment:
  ```powershell
  python -m venv "C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\venv_antigravity_sdk"
  ```
- Activate the virtual environment and upgrade pip:
  ```powershell
  & "C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\venv_antigravity_sdk\Scripts\Activate.ps1"
  python -m pip install --upgrade pip
  ```

### Phase 3: Package Installation
- Install `google-antigravity` from PyPI to get the platform-specific compiled runtime binaries:
  ```powershell
  pip install google-antigravity
  ```
- Install the local cloned repository in editable mode (`-e .`) to allow local customization and testing of the repository's files:
  ```powershell
  pip install -e "C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\antigravity-sdk-python"
  ```

### Phase 4: Tools Index Integration
- Modify `C:\Users\Gari Iriana\.gemini\antigravity-ide\scratch\tools\tools_index.md` to register `antigravity-sdk-python`.
- Provide usage instructions and activate/deactivate scripts for Gari to easily run SDK applications.

---

## 4. Verification Plan
To verify the installation, we will execute a smoke test script:
1. Activate `venv_antigravity_sdk`.
2. Import `antigravity` package.
3. Print SDK version and verified runtime capabilities.
4. Verify that `tools_index.md` renders correctly.
