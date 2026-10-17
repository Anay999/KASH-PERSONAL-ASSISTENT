# ==============================================================================
# PROJECT JARVIS - Master Launcher Script for Windows 11
# ==============================================================================

Write-Host "==================================================================" -ForegroundColor Yellow
Write-Host "                PROJECT JARVIS - NEURAL COMMAND CENTER             " -ForegroundColor DarkYellow
Write-Host "        Locally Operated Personal AI Voice Assistant for Windows 11" -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Yellow
Write-Host ""

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) {
    $ScriptDir = (Get-Location).Path
}

# 1. Detect Python
Write-Host "[1/5] Checking Python Environment..." -ForegroundColor Cyan
$PyExe = "py"
$PyArgs = "-3.11"

if (Get-Command "py" -ErrorAction SilentlyContinue) {
    Write-Host "       Found Python Launcher (py -3.11)" -ForegroundColor Green
} elseif (Get-Command "python" -ErrorAction SilentlyContinue) {
    $PyExe = "python"
    $PyArgs = ""
    Write-Host "       Found Python executable" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Python was not found. Please install Python from https://www.python.org/" -ForegroundColor Red
    exit 1
}

# 2. Detect Node.js
Write-Host "[2/5] Checking Node.js Environment..." -ForegroundColor Cyan
if (-not (Get-Command "npm" -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js / npm was not found. Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    exit 1
}
$NodeVer = & node --version
Write-Host "       Node.js version: $NodeVer" -ForegroundColor Green

# 3. Detect and start Ollama
Write-Host "[3/5] Checking Ollama Service..." -ForegroundColor Cyan
$OllamaProcess = Get-Process -Name "*ollama*" -ErrorAction SilentlyContinue
if (-not $OllamaProcess) {
    Write-Host "       Starting local Ollama server..." -ForegroundColor Yellow
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

try {
    $TagsResp = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5 -ErrorAction Stop
    $InstalledModels = $TagsResp.models.name
    $ModelsText = $InstalledModels -join ", "
    Write-Host "       Ollama is online. Models: $ModelsText" -ForegroundColor Green
} catch {
    Write-Host "       [WARNING] Could not query Ollama at http://127.0.0.1:11434." -ForegroundColor Yellow
    Write-Host "       JARVIS will run with text/voice and connect when Ollama is ready." -ForegroundColor Yellow
}

# 4. Check & Launch Backend Server
Write-Host "[4/5] Checking Backend Server..." -ForegroundColor Cyan
$BackendRunning = $false
try {
    $healthCheck = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health" -TimeoutSec 2 -ErrorAction Stop
    if ($healthCheck.status -eq "healthy") {
        $BackendRunning = $true
        Write-Host "       Backend is already running and healthy on http://127.0.0.1:8000." -ForegroundColor Green
    }
} catch {
    $BackendRunning = $false
}

if (-not $BackendRunning) {
    $BackendDir = Join-Path $ScriptDir "backend"
    Write-Host "       Launching FastAPI Backend on http://127.0.0.1:8000..." -ForegroundColor Cyan
    if ($PyArgs) {
        $BackendCommand = "$PyExe $PyArgs run.py"
    } else {
        $BackendCommand = "$PyExe run.py"
    }
    $BackendProc = Start-Process powershell.exe -WorkingDirectory $BackendDir -ArgumentList "-NoExit", "-Command", $BackendCommand -PassThru
    Write-Host "       Backend process launched (PID: $($BackendProc.Id))." -ForegroundColor Green
}

# 5. Check & Launch Frontend Server
Write-Host "[5/5] Checking Frontend Server..." -ForegroundColor Cyan
$FrontendRunning = $false
try {
    $feCheck = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    if ($feCheck.StatusCode -eq 200) {
        $FrontendRunning = $true
        Write-Host "       Frontend is already running on http://localhost:5173." -ForegroundColor Green
    }
} catch {
    $FrontendRunning = $false
}

if (-not $FrontendRunning) {
    $FrontendDir = Join-Path $ScriptDir "frontend"
    Write-Host "       Launching Vite Frontend on http://localhost:5173..." -ForegroundColor Cyan
    $FrontendProc = Start-Process cmd.exe -WorkingDirectory $FrontendDir -ArgumentList "/k", "npm run dev" -PassThru
    Write-Host "       Frontend process launched (PID: $($FrontendProc.Id))." -ForegroundColor Green
}

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Yellow
Write-Host "  JARVIS IS INITIALIZED AND READY!" -ForegroundColor DarkYellow
Write-Host "  - UI Command Center : http://localhost:5173" -ForegroundColor Cyan
Write-Host "  - Backend API Docs  : http://127.0.0.1:8000/docs" -ForegroundColor Cyan
Write-Host "  - WebSocket Gateway : ws://127.0.0.1:8000/ws/session" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Opening http://localhost:5173 in default browser..." -ForegroundColor Green
Start-Sleep -Seconds 1
Start-Process "http://localhost:5173"
