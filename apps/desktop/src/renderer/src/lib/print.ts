export function printHtml(html: string): void {
  // We use the new IPC handler to open this in the user's default external browser
  // (e.g. Chrome/Edge) which provides a standard print preview dialog.
  window.donkor.documents.printExternal(html).catch((err: Error) => {
    console.error('Failed to open external print preview:', err);
  });
}
