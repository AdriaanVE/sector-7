#import <AppKit/AppKit.h>
#include <stdio.h>

int main(void) {
  @autoreleasepool {
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    [NSApp finishLaunching];
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.title = @"Sector 7";
    panel.message = @"Connect a folder to Sector 7";
    panel.prompt = @"Connect";
    panel.canChooseFiles = NO;
    panel.canChooseDirectories = YES;
    panel.allowsMultipleSelection = NO;
    panel.canCreateDirectories = NO;
    panel.directoryURL = [NSURL fileURLWithPath:NSHomeDirectory() isDirectory:YES];
    [NSApp activateIgnoringOtherApps:YES];
    if ([panel runModal] != NSModalResponseOK) return 2;
    NSString *path = panel.URL.path;
    if (!path) return 1;
    NSData *bytes = [path dataUsingEncoding:NSUTF8StringEncoding];
    if (fwrite(bytes.bytes, 1, bytes.length, stdout) != bytes.length) return 1;
    return fputc('\n', stdout) == EOF ? 1 : 0;
  }
}
