param(
    [Parameter(Mandatory = $true)]
    [string]$ServerName
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$configPath = Join-Path $projectRoot ".mcp.json"

if (-not (Test-Path -LiteralPath $configPath)) {
    [Console]::Error.WriteLine("Missing project MCP configuration: $configPath")
    exit 1
}

$config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
$serverProperty = $config.mcpServers.PSObject.Properties[$ServerName]

if ($null -eq $serverProperty) {
    [Console]::Error.WriteLine("MCP server '$ServerName' is not defined in $configPath")
    exit 1
}

$server = $serverProperty.Value

if ($null -ne $server.env) {
    foreach ($entry in $server.env.PSObject.Properties) {
        [Environment]::SetEnvironmentVariable(
            $entry.Name,
            [string]$entry.Value,
            [EnvironmentVariableTarget]::Process
        )
    }
}

$command = [string]$server.command
$serverArgs = @($server.args | ForEach-Object { [string]$_ })

& $command @serverArgs
exit $LASTEXITCODE
