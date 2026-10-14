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
    public double? CaptionCenterY { get; set; }
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

    private delegate bool EnumCallback(IntPtr hwnd, IntPtr param);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumCallback callback, IntPtr param);
    [DllImport("user32.dll")] private static extern int GetWindowLong(IntPtr hwnd, int index);

    private static IntPtr lastMain = IntPtr.Zero;
    private static uint lastPid = 0;
    [DllImport("dwmapi.dll", EntryPoint="DwmGetWindowAttribute")]
    private static extern int GetDwmInt(IntPtr hwnd, int attr, out int value, int size);

    private static bool IsExposed(IntPtr main, uint pid) {
        RECT target;
        if (!IsWindowVisible(main) || IsIconic(main) || !GetWindowRect(main, out target)) return false;
        int cloaked;
        if (GetDwmInt(main, 14, out cloaked, 4) == 0 && cloaked != 0) return false;
        int x = target.Left + (target.Right - target.Left) / 2;
        int y = target.Top + (int)(22 * GetDpiForWindow(main) / 96);
        bool exposed = true;
        EnumWindows((other, unused) => {
            if (other == main) return false;
            uint owner; GetWindowThreadProcessId(other, out owner);
            RECT r;
            if (owner == pid || !IsWindowVisible(other) || IsIconic(other)) return true;
            int hidden;
            if (GetDwmInt(other, 14, out hidden, 4) == 0 && hidden != 0) return true;
            if (!GetWindowRect(other, out r) || x < r.Left || x >= r.Right || y < r.Top || y >= r.Bottom) return true;
            try { if (Process.GetProcessById((int)owner).ProcessName == "Codex Usage Companion") return true; } catch { }
            exposed = false;
            return false;
        }, IntPtr.Zero);
        return exposed;
    }

    private static bool IsMainWindow(IntPtr hwnd) {
        // Codex main windows are resizable; its pet/overlay windows are not.
        return (GetWindowLong(hwnd, -16) & 0x00040000) != 0;
    }

    private static IntPtr ResolveMainWindow(IntPtr foreground, uint pid) {
        if (IsMainWindow(foreground)) return foreground;
        IntPtr best = IntPtr.Zero;
        long largest = 0;
        EnumWindows((candidate, unused) => {
            uint owner;
            GetWindowThreadProcessId(candidate, out owner);
            RECT bounds;
            if (owner == pid && IsMainWindow(candidate) && IsWindowVisible(candidate)
                && !IsIconic(candidate) && GetWindowRect(candidate, out bounds)) {
                long area = (long)(bounds.Right - bounds.Left) * (bounds.Bottom - bounds.Top);
                if (area > largest) { largest = area; best = candidate; }
            }
            return true;
        }, IntPtr.Zero);
        return best;
    }
    public static void EnablePerMonitorDpi()
    {
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
    }

    public static CodexWindowState Capture()
    {
        IntPtr foreground = GetForegroundWindow();
        uint pid = 0;
        GetWindowThreadProcessId(foreground, out pid);
        bool known = false;
        try {
            Process process = Process.GetProcessById((int)pid);
            string path = process.MainModule.FileName;
            string name = Path.GetFileName(path);
            known = name.Equals("Codex.exe", StringComparison.OrdinalIgnoreCase)
                || (name.Equals("ChatGPT.exe", StringComparison.OrdinalIgnoreCase)
                && path.IndexOf(@"\WindowsApps\OpenAI.Codex_", StringComparison.OrdinalIgnoreCase) >= 0);
        } catch { }
        IntPtr hwnd = known ? ResolveMainWindow(foreground, pid) : lastMain;
        if (!known) pid = lastPid;
        uint actualPid = 0;
        if (hwnd != IntPtr.Zero) GetWindowThreadProcessId(hwnd, out actualPid);
        if (hwnd == IntPtr.Zero || actualPid != pid || !IsMainWindow(hwnd)) return Inactive();
        lastMain = hwnd; lastPid = pid;
        if (!IsExposed(hwnd, pid)) return Inactive();
        RECT rect;
        const int extendedFrameBounds = 9;
        if (DwmGetWindowAttribute(hwnd, extendedFrameBounds, out rect, Marshal.SizeOf(typeof(RECT))) != 0)
            GetWindowRect(hwnd, out rect);

        uint dpi = 96;
        try { dpi = GetDpiForWindow(hwnd); } catch { }
        if (dpi == 0) dpi = 96;

        // DWM caption buttons are window-relative physical pixels, not frame-relative.
        // Read them on every capture so maximize, DPI and title-bar changes are followed.
        double? captionCenterY = null;
        RECT buttons, window;
        if (!IsIconic(hwnd) && GetWindowRect(hwnd, out window)
            && DwmGetWindowAttribute(hwnd, 5, out buttons, Marshal.SizeOf(typeof(RECT))) == 0
            && buttons.Right > buttons.Left && buttons.Bottom > buttons.Top) {
            double center = window.Top + (buttons.Top + buttons.Bottom) / 2.0;
            double offset = (center - rect.Top) * 96.0 / dpi;
            if (offset >= 12 && offset <= 64) captionCenterY = center;
        }

        return new CodexWindowState {
            Active = true,
            Hwnd = hwnd.ToInt64(),
            Minimized = IsIconic(hwnd),
            Maximized = IsZoomed(hwnd),
            Left = rect.Left,
            Top = rect.Top,
            Right = rect.Right,
            Bottom = rect.Bottom,
            Dpi = dpi,
            CaptionCenterY = captionCenterY
        };
    }

    private static CodexWindowState Inactive()
    {
        return new CodexWindowState { Active = false, Hwnd = 0, Minimized = false, Maximized = false, Dpi = 96 };
    }
}
'@

[CodexWindowTracker]::EnablePerMonitorDpi()
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$captionTimer = [System.Diagnostics.Stopwatch]::StartNew()
$captionKey = ''
$captionHeight = $null
$last = ''
$heartbeat = [System.Diagnostics.Stopwatch]::StartNew()
$parentCheck = 0

while ($true) {
    $parentCheck++
    if ($parentCheck -ge 30) {
        $parentCheck = 0
        if (-not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }
    }

    $state = [CodexWindowTracker]::Capture()
    if ($state.Active) {
        $key = "$($state.Hwnd):$($state.Right - $state.Left):$($state.Bottom - $state.Top):$($state.Dpi):$($state.Maximized)"
        if ($key -ne $captionKey -or $captionTimer.ElapsedMilliseconds -ge 1500) {
            if ($key -ne $captionKey) { $captionHeight = $null }
            try {
                $root = [System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$state.Hwnd)
                $groups = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants,
                    [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Group))
                $scale = $state.Dpi / 96.0
                $width = $state.Right - $state.Left
                $bands = @{}
                foreach ($group in $groups) {
                    $r = $group.Current.BoundingRectangle
                    $top = [Math]::Round($r.Top - $state.Top)
                    if ($top -lt 28 * $scale -or $top -gt 80 * $scale -or $r.Height -lt 80 * $scale -or $r.Width -lt $width * 0.15) { continue }
                    $left = [Math]::Max($state.Left, $r.Left)
                    $right = [Math]::Min($state.Right, $r.Right)
                    if ($right -le $left) { continue }
                    $k = [string]$top
                    if (-not $bands.ContainsKey($k)) { $bands[$k] = @() }
                    $bands[$k] += [pscustomobject]@{ Left = $left; Right = $right }
                }
                foreach ($top in ($bands.Keys | ForEach-Object { [double]$_ } | Sort-Object)) {
                    $covered = 0.0
                    $edge = [double]$state.Left
                    foreach ($span in ($bands[[string]$top] | Sort-Object Left)) {
                        $covered += [Math]::Max(0, $span.Right - [Math]::Max($edge, $span.Left))
                        $edge = [Math]::Max($edge, $span.Right)
                    }
                    if ($covered -ge $width * 0.85) {
                        $captionHeight = $top
                        break
                    }
                }            } catch { }
            $captionKey = $key
            $captionTimer.Restart()
        }
        if ($null -ne $captionHeight) { $state.CaptionCenterY = $state.Top + $captionHeight / 2 }
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
            captionCenterY = $state.CaptionCenterY
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
    if ($json -ne $last -or $heartbeat.ElapsedMilliseconds -ge 1000) {
        [Console]::Out.WriteLine($json)
        [Console]::Out.Flush()
        $last = $json
        $heartbeat.Restart()
    }
    Start-Sleep -Milliseconds 33
}
