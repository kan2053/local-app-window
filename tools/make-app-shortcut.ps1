<#
  为某个网址创建「真·应用窗口」快捷方式（可带自定义图标）。

  为什么需要这个脚本：
    Chrome 扩展无法设置窗口/任务栏图标（Manifest V3 没有这个 API）。
    唯一能让 Windows 任务栏显示自定义图标的方式，是用
    chrome.exe --app=<网址> 启动，并在快捷方式上指定 .ico 文件 ——
    因为 Windows 的任务栏图标本来就取自快捷方式的图标资源。

  用法：
    powershell -ExecutionPolicy Bypass -File make-app-shortcut.ps1 `
        -Url "http://127.0.0.1:5599" -Name "我的后台" -Icon "D:\icons\app.ico"

  参数：
    -Url      必填，要打开的网址
    -Name     快捷方式名称（默认取网址主机名）
    -Icon     .ico 文件路径（可省略；必须是 .ico，PNG 不行）
    -Browser  浏览器路径（默认自动探测 Chrome / Edge）
    -OutDir   输出目录（默认桌面）
#>

param(
  [Parameter(Mandatory = $true)][string]$Url,
  [string]$Name = "",
  [string]$Icon = "",
  [string]$Browser = "",
  [string]$OutDir = [Environment]::GetFolderPath("Desktop")
)

$ErrorActionPreference = "Stop"

# ---- 浏览器 -----------------------------------------------------------------
if (-not $Browser) {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  )
  $Browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $Browser -or -not (Test-Path $Browser)) {
  throw "找不到 Chrome / Edge，请用 -Browser 指定浏览器路径。"
}

# ---- 名称 -------------------------------------------------------------------
if (-not $Name) {
  try { $Name = ([Uri]$Url).Host } catch { $Name = "App" }
}

# ---- 图标检查 ---------------------------------------------------------------
if ($Icon) {
  if (-not (Test-Path $Icon)) { throw "图标文件不存在：$Icon" }
  if ([IO.Path]::GetExtension($Icon).ToLower() -ne ".ico") {
    Write-Warning "图标不是 .ico 格式，Windows 快捷方式通常只认 .ico，可能显示不出来。"
  }
  $Icon = (Resolve-Path $Icon).Path
}

# ---- 生成 -------------------------------------------------------------------
if (-not (Test-Path $OutDir)) { throw "输出目录不存在：$OutDir" }
$lnkPath = Join-Path $OutDir "$Name.lnk"

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath = $Browser
$lnk.Arguments = "--app=$Url"
$lnk.Description = "以应用窗口打开 $Url"
if ($Icon) { $lnk.IconLocation = "$Icon,0" }
$lnk.Save()

Write-Host "已创建： $lnkPath"
Write-Host "浏览器： $Browser"
Write-Host "参数：   --app=$Url"
if ($Icon) { Write-Host "图标：   $Icon" } else { Write-Host "图标：   未指定（使用浏览器默认图标）" }
Write-Host ""
Write-Host "提示：这个快捷方式打开的是真正的应用窗口（连标题栏都极简、任务栏图标独立），"
Write-Host "      它不走扩展的 popup 逻辑 —— 两者可以并存，按需要选用。"
