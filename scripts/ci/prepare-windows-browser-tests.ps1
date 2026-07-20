$ErrorActionPreference = 'Stop'

$projectDirectory = if ($env:CI_PROJECT_DIR) {
  [IO.Path]::GetFullPath($env:CI_PROJECT_DIR)
} else {
  (Get-Location).Path
}

$projectPattern = [regex]::Escape($projectDirectory)
$testProcesses = @(Get-CimInstance Win32_Process | Where-Object {
  $commandLine = $_.CommandLine
  if (-not $commandLine -or $_.ProcessId -eq $PID) {
    return $false
  }

  $belongsToProject = $commandLine -match $projectPattern
  $isBrowserTestProcess = $commandLine -match 'playwright|storybook|vitest|ms-playwright'
  return $belongsToProject -and $isBrowserTestProcess
})

foreach ($process in $testProcesses) {
  # /T also terminates Chromium children left behind after a failed Vitest run.
  & taskkill.exe /PID $process.ProcessId /T /F *> $null
}

$listeners = @(Get-NetTCPConnection -LocalPort 6006 -State Listen -ErrorAction SilentlyContinue)
foreach ($listener in $listeners) {
  Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Milliseconds 750

if (Get-NetTCPConnection -LocalPort 6006 -State Listen -ErrorAction SilentlyContinue) {
  throw 'Storybook port 6006 is still occupied after browser-test preflight.'
}

Write-Output "Windows browser-test preflight complete. Removed $($testProcesses.Count) stale project process(es)."
