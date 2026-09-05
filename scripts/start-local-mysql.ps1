param(
  [int]$Port = 3307
)

$ErrorActionPreference = 'Stop'
$localMysqlRoot = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'kkiri-kkiri'))
$dataDirectory = [System.IO.Path]::GetFullPath((Join-Path $localMysqlRoot 'mysql-data'))
$mysqlRoot = 'C:\Program Files\MySQL\MySQL Server 8.0'
$mysqld = Join-Path $mysqlRoot 'bin\mysqld.exe'

if (-not $dataDirectory.StartsWith($localMysqlRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw '로컬 MySQL 데이터 경로가 전용 앱 데이터 폴더 밖을 가리킵니다.'
}
if (-not (Test-Path -LiteralPath $mysqld)) {
  throw "MySQL 서버 실행 파일을 찾을 수 없습니다: $mysqld"
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  Write-Output "LOCAL_MYSQL_ALREADY_RUNNING port=$Port pid=$($listener[0].OwningProcess)"
  exit 0
}

if (-not (Test-Path -LiteralPath (Join-Path $dataDirectory 'mysql'))) {
  New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
  & $mysqld --no-defaults --initialize-insecure --basedir="$mysqlRoot" --datadir="$dataDirectory"
  if ($LASTEXITCODE -ne 0) {
    throw "MySQL 데이터 디렉터리 초기화에 실패했습니다. exit=$LASTEXITCODE"
  }
}

$arguments = @(
  '--no-defaults',
  "--basedir=`"$mysqlRoot`"",
  "--datadir=`"$dataDirectory`"",
  "--port=$Port",
  '--bind-address=127.0.0.1',
  '--mysqlx=0',
  '--skip-log-bin',
  '--character-set-server=utf8mb4',
  '--collation-server=utf8mb4_unicode_ci'
)
$process = Start-Process -FilePath $mysqld -ArgumentList $arguments -WindowStyle Hidden -PassThru

for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
  Start-Sleep -Milliseconds 500
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($listener) {
    Write-Output "LOCAL_MYSQL_STARTED port=$Port pid=$($process.Id) data=$dataDirectory"
    exit 0
  }
  if ($process.HasExited) {
    throw "MySQL 프로세스가 시작 중 종료됐습니다. exit=$($process.ExitCode)"
  }
}

throw "MySQL이 제한 시간 안에 포트 $Port 에서 시작되지 않았습니다."
