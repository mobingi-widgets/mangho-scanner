# Game window tracker for the overlay (read-only window queries, nothing else).
# Prints one JSON line whenever the Mabinogi Mobile window's client area, minimized
# state or foreground state changes; exits when the overlay process is gone.
# Keep this file ASCII: Windows PowerShell 5.1 reads a BOM-less script in the system
# code page, so the window title is built from character codes below.
param([int]$Owner = 0)
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class ManghoGameWin {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  // Unicode: the ANSI entry point counts the title in code-page bytes, not characters
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);

  // the game's window title (Mabinogi Mobile, in Korean)
  static readonly string Title = new string(new char[] {
    (char)0xB9C8, (char)0xBE44, (char)0xB178, (char)0xAE30, ' ', (char)0xBAA8, (char)0xBC14, (char)0xC77C });
  static IntPtr hwnd = IntPtr.Zero;

  static IntPtr Find() {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      int n = GetWindowTextLength(h);
      if (n != Title.Length || !IsWindowVisible(h)) return true;
      StringBuilder sb = new StringBuilder(n + 1);
      GetWindowText(h, sb, n + 1);
      if (sb.ToString() == Title) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static bool Found { get { return hwnd != IntPtr.Zero; } }

  // physical pixels (per-monitor DPI aware); Electron converts them to DIPs
  public static string State(int owner) {
    try { SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch (Exception) { }
    if (hwnd == IntPtr.Zero || !IsWindow(hwnd)) hwnd = Find();
    if (hwnd == IntPtr.Zero) return "{\"found\":false}";
    RECT rc;
    GetClientRect(hwnd, out rc);
    POINT pt = new POINT();
    ClientToScreen(hwnd, ref pt);
    IntPtr fg = GetForegroundWindow();
    uint pid;
    GetWindowThreadProcessId(fg, out pid);
    string front = fg == hwnd ? "game" : (owner > 0 && pid == (uint)owner ? "self" : "other");
    return "{\"found\":true,\"rect\":[" + pt.X + "," + pt.Y + "," + rc.R + "," + rc.B + "],\"minimized\":"
      + (IsIconic(hwnd) ? "true" : "false") + ",\"front\":\"" + front + "\"}";
  }

  public static bool Alive(int pid) {
    if (pid <= 0) return true;
    try { return !Process.GetProcessById(pid).HasExited; } catch (Exception) { return false; }
  }
}
'@

$last = ''
$n = 0
while ($true) {
  $s = [ManghoGameWin]::State($Owner)
  if ($s -ne $last) {
    [Console]::Out.WriteLine($s)
    [Console]::Out.Flush()
    $last = $s
  }
  $n++
  if (($n % 8) -eq 0 -and -not [ManghoGameWin]::Alive($Owner)) { exit 0 }
  if ([ManghoGameWin]::Found) { Start-Sleep -Milliseconds 250 } else { Start-Sleep -Milliseconds 2000 }
}
