$ErrorActionPreference = "Stop"

function Get-Ws {
  $pages = @(Invoke-RestMethod http://127.0.0.1:9222/json)
  $page = $pages |
    Where-Object {
      $_.url -like "http://tauri.localhost*" -or
      $_.url -like "https://tauri.localhost*" -or
      $_.url -like "http://localhost:24200*" -or
      $_.url -like "http://127.0.0.1:24200*"
    } |
    Select-Object -First 1
  if (-not $page) {
    $urls = ($pages | ForEach-Object { $_.url }) -join "; "
    throw "No tauri page on CDP. Seen: $urls"
  }
  return $page.webSocketDebuggerUrl
}

function Cdp([string]$ws, [string]$method, $params = @{}) {
  $wsock = New-Object System.Net.WebSockets.ClientWebSocket
  $ct = [Threading.CancellationToken]::None
  $wsock.ConnectAsync([Uri]$ws, $ct).Wait()
  $id = Get-Random -Minimum 1 -Maximum 999999
  $payloadObj = @{ id = $id; method = $method; params = $params }
  $payload = $payloadObj | ConvertTo-Json -Compress -Depth 10
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $wsock.SendAsync((New-Object ArraySegment[byte] -ArgumentList @(, $bytes)), [Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
  $buf = New-Object byte[] 8388608
  $ms = New-Object IO.MemoryStream
  do {
    $seg = New-Object ArraySegment[byte] -ArgumentList @(, $buf)
    $r = $wsock.ReceiveAsync($seg, $ct).Result
    $ms.Write($buf, 0, $r.Count)
  } while (-not $r.EndOfMessage)
  $wsock.Dispose()
  return ([Text.Encoding]::UTF8.GetString($ms.ToArray()) | ConvertFrom-Json)
}

function Eval-Js([string]$ws, [string]$expression) {
  $res = Cdp $ws "Runtime.evaluate" @{ expression = $expression; awaitPromise = $true; returnByValue = $true }
  return $res.result.result.value
}

function Shot([string]$ws, [string]$path) {
  $res = Cdp $ws "Page.captureScreenshot" @{ format = "png"; fromSurface = $true; captureBeyondViewport = $false }
  $b64 = $res.result.data
  if (-not $b64) { throw "No screenshot data for $path" }
  [IO.File]::WriteAllBytes($path, [Convert]::FromBase64String($b64))
  Write-Host ("Saved {0} ({1} bytes)" -f $path, (Get-Item $path).Length)
}

function Prep([string]$ws, [string]$lang) {
  $null = Eval-Js $ws @"
localStorage.setItem('i18nextLng','$lang');
localStorage.setItem('skills-manage:show-all-platforms','true');
localStorage.setItem('skills-manage:show-empty-project-directories','true');
localStorage.setItem('skills-manage:sidebar-software-platforms-collapsed','false');
localStorage.setItem('skills-manage:sidebar-project-directories-collapsed','false');
location.reload();
"@
  Start-Sleep -Seconds 3
  return (Get-Ws)
}

function Go([string]$ws, [string]$path) {
  $null = Eval-Js $ws "location.href='$path'; 'ok'"
  Start-Sleep -Seconds 2
  return (Get-Ws)
}

function ClickContains([string]$ws, [string]$needle) {
  $n = $needle.Replace("\", "\\").Replace("'", "\'")
  $val = Eval-Js $ws @"
(function(){
  var needle = '$n';
  var buttons = Array.prototype.slice.call(document.querySelectorAll('button'));
  var el = buttons.find(function(b){
    var label = (b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '');
    return label.indexOf(needle) >= 0;
  });
  if (!el) return 'missing:' + needle;
  el.click();
  return 'clicked:' + needle;
})()
"@
  Write-Host $val
  Start-Sleep -Seconds 1.5
}

Get-Process skillshub -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9222"
$proc = Start-Process (Resolve-Path "src-tauri\target\debug\skillshub.exe") -PassThru
Start-Sleep -Seconds 5
$ws = Get-Ws
$null = Cdp $ws "Page.enable" @{}
$zh = (Resolve-Path "images").Path
$en = Join-Path $zh "en"

function Wait-Ready([string]$ws, [int]$seconds = 4) {
  Start-Sleep -Seconds $seconds
  $null = Eval-Js $ws @"
(function(){
  var root = document.querySelector('[data-tauri-drag-region], main, body');
  return root ? 'ok' : 'missing';
})()
"@
}

function ShotSettings([string]$ws, [string]$path) {
  $null = Eval-Js $ws @"
(function(){
  var main = document.querySelector('.overflow-auto') || document.querySelector('main') || document.body;
  if (main && main.scrollTo) main.scrollTo(0, 0);
  return 'scrolled';
})()
"@
  Start-Sleep -Seconds 1
  Shot $ws $path
}

function ClickSidebar([string]$ws, [string]$needle) {
  $n = $needle.Replace("\", "\\").Replace("'", "\'")
  $val = Eval-Js $ws @"
(function(){
  var needle = '$n';
  var buttons = Array.prototype.slice.call(document.querySelectorAll('button'));
  var el = buttons.find(function(b){
    var label = ((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')).trim();
    return label.indexOf(needle) >= 0;
  });
  if (!el) return 'missing:' + needle;
  el.click();
  return 'clicked:' + needle;
})()
"@
  Write-Host $val
  Start-Sleep -Seconds 2
}

$ws = Prep $ws "zh"
Wait-Ready $ws 4
$ws = Go $ws "/resources"; Wait-Ready $ws 3; Shot $ws (Join-Path $zh "01.png")
$ws = Go $ws "/central"; Wait-Ready $ws 5; Shot $ws (Join-Path $zh "02.png")
$ws = Go $ws "/collections"; Wait-Ready $ws 3; Shot $ws (Join-Path $zh "03.png")
$ws = Go $ws "/settings"; Wait-Ready $ws 3; ShotSettings $ws (Join-Path $zh "04.png")
$ws = Go $ws "/resources"; Wait-Ready $ws 2
ClickSidebar $ws "Claude Code"
Shot $ws (Join-Path $zh "05.png")
$proj = Eval-Js $ws @"
(function(){
  var buttons = Array.prototype.slice.call(document.querySelectorAll('button'));
  var el = buttons.find(function(b){
    var label = (b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '');
    return label.indexOf('project:') >= 0 || /Example|Demo Project|项目/i.test(label);
  });
  if (!el) return 'none';
  el.click();
  return el.getAttribute('aria-label') || 'clicked';
})()
"@
Write-Host ("project=" + $proj)
Start-Sleep -Seconds 2
Shot $ws (Join-Path $zh "06.png")

$ws = Prep $ws "en"
Wait-Ready $ws 4
$ws = Go $ws "/resources"; Wait-Ready $ws 3; Shot $ws (Join-Path $en "01.png")
$ws = Go $ws "/central"; Wait-Ready $ws 5; Shot $ws (Join-Path $en "02.png")
$ws = Go $ws "/collections"; Wait-Ready $ws 3; Shot $ws (Join-Path $en "03.png")
$ws = Go $ws "/settings"; Wait-Ready $ws 3; ShotSettings $ws (Join-Path $en "04.png")
$ws = Go $ws "/resources"; Wait-Ready $ws 2
ClickSidebar $ws "Claude Code"
Shot $ws (Join-Path $en "05.png")
$proj = Eval-Js $ws @"
(function(){
  var buttons = Array.prototype.slice.call(document.querySelectorAll('button'));
  var el = buttons.find(function(b){
    var label = (b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '');
    return label.indexOf('project:') >= 0 || /Example|Demo Project/i.test(label);
  });
  if (!el) return 'none';
  el.click();
  return el.getAttribute('aria-label') || 'clicked';
})()
"@
Write-Host ("project-en=" + $proj)
Start-Sleep -Seconds 2
Shot $ws (Join-Path $en "06.png")

Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
Remove-Item Env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
Write-Host DONE
