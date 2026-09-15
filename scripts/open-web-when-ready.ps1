param(
  [string]$Url = 'http://localhost:5173',
  [ValidateRange(1, 600)]
  [int]$TimeoutSeconds = 120,
  [switch]$NoOpen
)

$ErrorActionPreference = 'SilentlyContinue'
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$ready = $false

do {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      $ready = $true
      break
    }
  } catch {
    # The dev server may still be starting.
  }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)

if (-not $ready) {
  exit 1
}

if ($NoOpen) {
  Write-Output "WEB_READY url=$Url"
  exit 0
}

$chromeCandidates = @(
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
)
$chromePath = $null
foreach ($candidate in $chromeCandidates) {
  if (Test-Path -LiteralPath $candidate) {
    $chromePath = $candidate
    break
  }
}

if ($chromePath) {
  Start-Process -FilePath $chromePath -ArgumentList $Url
} else {
  Start-Process $Url
}
