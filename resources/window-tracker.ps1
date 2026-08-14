param(
    [Parameter(Mandatory = $true)]
    [int]$ParentPid
)

$ErrorActionPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;

public sealed class CodexWindowState
{
    public bool Active { get; set; }
    public long Hwnd { get; set; }
    public bool Minimized { get; set; }
    public bool Maximized { get; set; }
    public int Left { get; set; }
    public int Top { get; set; }
    public int Right { get; set; }
    public int Bottom { get; set; }
    public uint Dpi { get; set; }
}

public static class CodexWindowTracker
{
    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left, Top, Right, Bottom; }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsZoomed(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out RECT value, int size);

    public static void EnablePerMonitorDpi()
    {
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
    }

    public static CodexWindowState Capture()
    {
        IntPtr hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero || !IsWindowVisible(hwnd)) return Inactive();

        uint pid;
        GetWindowThreadProcessId(hwnd, out pid);
        string processName;
        string processPath;
        try
        {
            Process process = Process.GetProcessById((int)pid);
            processName = process.ProcessName;
            processPath = process.MainModule.FileName;
        }
        catch { return Inactive(); }

        string fileName = Path.GetFileName(processPath);
        bool knownName = fileName.Equals("ChatGPT.exe", StringComparison.OrdinalIgnoreCase)
            || fileName.Equals("Codex.exe", StringComparison.OrdinalIgnoreCase)
            || processName.Equals("ChatGPT", StringComparison.OrdinalIgnoreCase)
            || processName.Equals("Codex", StringComparison.OrdinalIgnoreCase);
        bool knownPackage = processPath.IndexOf("\\WindowsApps\\OpenAI.Codex_", StringComparison.OrdinalIgnoreCase) >= 0;
        bool standaloneCodex = fileName.Equals("Codex.exe", StringComparison.OrdinalIgnoreCase);
        if (!knownName || (!knownPackage && !standaloneCodex)) return Inactive();

        RECT rect;
        const int extendedFrameBounds = 9;
        if (DwmGetWindowAttribute(hwnd, extendedFrameBounds, out rect, Marshal.SizeOf(typeof(RECT))) != 0)
            GetWindowRect(hwnd, out rect);

        uint dpi = 96;
        try { dpi = GetDpiForWindow(hwnd); } catch { }
        if (dpi == 0) dpi = 96;

        return new CodexWindowState {
            Active = true,
            Hwnd = hwnd.ToInt64(),
            Minimized = IsIconic(hwnd),
            Maximized = IsZoomed(hwnd),
            Left = rect.Left,
            Top = rect.Top,
            Right = rect.Right,
            Bottom = rect.Bottom,
            Dpi = dpi
        };
    }

    private static CodexWindowState Inactive()
    {
        return new CodexWindowState { Active = false, Hwnd = 0, Minimized = false, Maximized = false, Dpi = 96 };
    }
}
'@

[CodexWindowTracker]::EnablePerMonitorDpi()
$last = ''
$parentCheck = 0

while ($true) {
    $parentCheck++
    if ($parentCheck -ge 30) {
        $parentCheck = 0
        if (-not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }
    }

    $state = [CodexWindowTracker]::Capture()
    if ($state.Active) {
        $payload = [ordered]@{
            active = $true
            hwnd = $state.Hwnd
            minimized = $state.Minimized
            maximized = $state.Maximized
            rect = [ordered]@{
                left = $state.Left
                top = $state.Top
                right = $state.Right
                bottom = $state.Bottom
            }
            dpi = [int]$state.Dpi
        }
    } else {
        $payload = [ordered]@{
            active = $false
            hwnd = 0
            minimized = $false
            maximized = $false
            rect = $null
            dpi = 96
        }
    }

    $json = $payload | ConvertTo-Json -Compress -Depth 4
    if ($json -ne $last) {
        [Console]::Out.WriteLine($json)
        [Console]::Out.Flush()
        $last = $json
    }
    Start-Sleep -Milliseconds 33
}
