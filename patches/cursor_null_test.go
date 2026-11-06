package xorg

import "testing"

func TestMissingNativeCursor(t *testing.T) {
	cursor := cursorImageFromNative(nil)
	if cursor == nil || cursor.Image == nil {
		t.Fatal("missing cursor must produce a usable fallback")
	}
	if cursor.Width != 1 || cursor.Height != 1 || cursor.Image.Bounds().Dx() != 1 || cursor.Image.Bounds().Dy() != 1 {
		t.Fatal("fallback cursor must be one pixel")
	}
	if cursor.Image.RGBAAt(0, 0).A != 0 {
		t.Fatal("fallback cursor must be transparent")
	}
}
