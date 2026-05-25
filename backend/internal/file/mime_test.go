package file

import (
	"bytes"
	"testing"

	"pgregory.net/rapid"
)

func TestMimeProperty_ValidHeaders(t *testing.T) {
	jpegMagic := []byte{0xFF, 0xD8, 0xFF}
	pngMagic := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
	pdfMagic := []byte("%PDF-")

	rapid.Check(t, func(rt *rapid.T) {
		// Draw format type: 0 = JPEG, 1 = PNG, 2 = PDF
		format := rapid.IntRange(0, 2).Draw(rt, "format")

		var magic []byte
		var expectedMime string

		switch format {
		case 0:
			magic = jpegMagic
			expectedMime = "image/jpeg"
		case 1:
			magic = pngMagic
			expectedMime = "image/png"
		case 2:
			magic = pdfMagic
			expectedMime = "application/pdf"
		}

		// Generate random payload trailing bytes
		payloadSize := rapid.IntRange(1, 1000).Draw(rt, "payloadSize")
		trailing := rapid.SliceOfN(rapid.Byte(), payloadSize, payloadSize).Draw(rt, "trailing")

		content := append(magic, trailing...)

		// Test DetectMIME
		detected := DetectMIME(content)
		if detected != expectedMime {
			rt.Fatalf("expected detected MIME %q, got %q", expectedMime, detected)
		}

		// Test ValidateMIME (valid size, matching declared type)
		validated, err := ValidateMIME(content, expectedMime)
		if err != nil {
			rt.Fatalf("expected ValidateMIME to succeed, got error: %v", err)
		}
		if validated != expectedMime {
			rt.Fatalf("expected validated MIME %q, got %q", expectedMime, validated)
		}

		// Test ValidateMIME (valid size, mismatching declared type)
		badDeclared := "application/octet-stream"
		_, err = ValidateMIME(content, badDeclared)
		if err == nil {
			rt.Fatalf("expected ValidateMIME to fail on mismatching declared type %s", badDeclared)
		}
	})
}

func TestMimeProperty_InvalidHeaders(t *testing.T) {
	jpegMagic := []byte{0xFF, 0xD8, 0xFF}
	pngMagic := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
	pdfMagic := []byte("%PDF-")

	rapid.Check(t, func(rt *rapid.T) {
		// Generate random content that does NOT match any of the valid magic signatures
		content := rapid.SliceOfN(rapid.Byte(), 10, 100).Filter(func(data []byte) bool {
			return !bytes.HasPrefix(data, jpegMagic) &&
				!bytes.HasPrefix(data, pngMagic) &&
				!bytes.HasPrefix(data, pdfMagic)
		}).Draw(rt, "invalidContent")

		detected := DetectMIME(content)
		if detected != "" {
			rt.Fatalf("expected no MIME to be detected for invalid content, got %q", detected)
		}

		_, err := ValidateMIME(content, "")
		if err == nil {
			rt.Fatalf("expected ValidateMIME to fail on invalid header bytes")
		}
		if err != ErrMIMEUnsupported {
			rt.Fatalf("expected ErrMIMEUnsupported, got: %v", err)
		}
	})
}

func TestMimeProperty_SizeLimits(t *testing.T) {
	jpegMagic := []byte{0xFF, 0xD8, 0xFF}

	rapid.Check(t, func(rt *rapid.T) {
		// Draw size larger than BackendMaxFileSize (10 MB = 10485760 bytes)
		// To avoid memory limits in testing, we can simulate large size by passing a mock slice or verifying limit checks
		// We'll generate a content slice of exactly BackendMaxFileSize + 1 byte
		oversizedBytes := make([]byte, BackendMaxFileSize+1)
		copy(oversizedBytes, jpegMagic)

		_, err := ValidateMIME(oversizedBytes, "image/jpeg")
		if err == nil {
			rt.Fatalf("expected ValidateMIME to reject oversized file, but it succeeded")
		}
		if err != ErrMIMETooLarge {
			rt.Fatalf("expected ErrMIMETooLarge, got: %v", err)
		}
	})
}
