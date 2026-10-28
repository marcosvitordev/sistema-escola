$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$binaryDirectory = Join-Path $projectRoot '.deployment/livekit'
$binaryPath = Join-Path $binaryDirectory 'livekit-server.exe'
$version = '1.13.11'
$listener = Get-NetTCPConnection -State Listen -LocalPort 7880 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $running = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
  if ($running.ExecutablePath -eq $binaryPath) { Write-Output 'Servidor de aulas ao vivo local ja esta iniciado.'; exit 0 }
  throw 'A porta 7880 esta ocupada por outro processo.'
}
if (-not (Test-Path -LiteralPath $binaryPath)) {
  New-Item -ItemType Directory -Path $binaryDirectory -Force | Out-Null
  $archivePath = Join-Path $binaryDirectory 'livekit.zip'
  $checksumPath = Join-Path $binaryDirectory 'checksums.txt'
  $archiveName = "livekit_${version}_windows_amd64.zip"
  Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/livekit/livekit/releases/download/v${version}/${archiveName}" -OutFile $archivePath
  Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/livekit/livekit/releases/download/v${version}/checksums.txt" -OutFile $checksumPath
  $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLower()
  $expected = Get-Content -LiteralPath $checksumPath | Where-Object { $_.EndsWith($archiveName) }
  if (-not $expected -or -not $expected.StartsWith($actualHash)) { throw 'Checksum do servidor ao vivo invalido.' }
  Expand-Archive -LiteralPath $archivePath -DestinationPath $binaryDirectory -Force
}
Start-Process -FilePath $binaryPath -ArgumentList '--config','deploy/livekit-local.yaml','--bind','127.0.0.1','--node-ip','127.0.0.1' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $binaryDirectory 'native.log') -RedirectStandardError (Join-Path $binaryDirectory 'native-error.log')
Write-Output 'Servidor de aulas ao vivo local iniciado na porta 7880.'
