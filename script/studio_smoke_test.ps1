$ErrorActionPreference = 'Stop'
Set-Location F:\misc\redmine
$env:RAILS_ENV = 'production'

$loginJson = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/studio/session' -Method POST -Body 'username=hui&password=hui12345' -ContentType 'application/x-www-form-urlencoded'
$key = $loginJson.user.api_key
if (-not $key) { throw 'Login failed: no api_key' }
Write-Host "OK login -> api_key"

function Test-Get($path, $expect = 200) {
  $code = curl.exe -s -o NUL -w "%{http_code}" -H "X-Redmine-API-Key: $key" "http://127.0.0.1:3000$path"
  if ([int]$code -ne $expect) { throw "$path expected $expect got $code" }
  Write-Host "OK GET $path ($code)"
}

Test-Get '/issues.json?limit=5'
Test-Get '/projects.json?limit=5'
Test-Get '/users.json?limit=5'
Test-Get '/trackers.json'
Test-Get '/issue_statuses.json'
Test-Get '/custom_fields.json'
Test-Get '/roles.json'
Test-Get '/groups.json'
Test-Get '/enumerations/IssuePriority.json'
Test-Get '/search.json?q=test'
Test-Get '/studio/gantt?months=6'
Test-Get '/studio/calendar?year=2026&month=10'
Test-Get '/studio/workflows'
Test-Get '/studio/settings'
Test-Get '/studio/projects/demo/boards'
Test-Get '/projects/2/news.json'
Test-Get '/projects/2/documents.json'
Test-Get '/projects/demo/files.json'
Test-Get '/time_entries.json?limit=5'
Test-Get '/projects/demo/wiki/index.json'

Write-Host 'All smoke checks passed.'
