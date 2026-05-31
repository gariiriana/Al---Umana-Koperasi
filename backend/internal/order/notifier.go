package order

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
)

type cacheItem struct {
	status        OrderStatus
	paymentStatus PaymentStatus
}

var (
	cacheMutex  sync.RWMutex
	ordersCache = make(map[string]cacheItem)
)

// WAPayload matches the input structure of our local Node.js gateway
type WAPayload struct {
	Number  string `json:"number"`
	Message string `json:"message"`
}

// StartNotifier starts the background goroutine to listen to Firestore order status changes
// and sends WhatsApp notifications.
func StartNotifier(ctx context.Context, client *firestore.Client) {
	if client == nil {
		log.Println("notifier: firestore client is nil; skipping background notification listener")
		return
	}

	go func() {
		log.Println("notifier: initializing background WhatsApp notification listener...")

		// 1. Populate initial orders cache to avoid spamming alerts on server restart
		iter := client.Collection(ordersCollection).Documents(ctx)
		for {
			doc, err := iter.Next()
			if errors.Is(err, iterator.Done) {
				break
			}
			if err != nil {
				log.Printf("notifier: failed to build initial orders cache: %v", err)
				break
			}

			var o Order
			if err := doc.DataTo(&o); err == nil {
				cacheMutex.Lock()
				ordersCache[doc.Ref.ID] = cacheItem{
					status:        o.Status,
					paymentStatus: o.PaymentStatus,
				}
				cacheMutex.Unlock()
			}
		}

		log.Printf("notifier: initial orders cache loaded with %d items", len(ordersCache))

		// 2. Subscribe to real-time changes
		snapshots := client.Collection(ordersCollection).Snapshots(ctx)
		for {
			snap, err := snapshots.Next()
			if err != nil {
				if ctx.Err() != nil {
					log.Println("notifier: background listener context cancelled; stopping worker")
					return
				}
				log.Printf("notifier: subscription error: %v; retrying in 5 seconds...", err)
				time.Sleep(5 * time.Second)
				continue
			}

			// Iterate over all document changes in this snapshot
			for _, change := range snap.Changes {
				orderID := change.Doc.Ref.ID
				var o Order
				if err := change.Doc.DataTo(&o); err != nil {
					log.Printf("notifier: failed to decode order %s: %v", orderID, err)
					continue
				}
				o.ID = orderID

				shortID := orderID
				if len(shortID) > 6 {
					shortID = strings.ToUpper(shortID[len(shortID)-6:])
				}

				cacheMutex.RLock()
				prev, exists := ordersCache[orderID]
				cacheMutex.RUnlock()

				switch change.Kind {
				case firestore.DocumentAdded:
					cacheMutex.Lock()
					ordersCache[orderID] = cacheItem{
						status:        o.Status,
						paymentStatus: o.PaymentStatus,
					}
					cacheMutex.Unlock()

					// If added and not in cache initially, trigger a new order alert
					if !exists {
						triggerNotification(ctx, client, o, getNewOrderMsg(o, shortID))
					}
				case firestore.DocumentModified:
					// Check for transitions
					statusChanged := prev.status != o.Status
					paymentStatusChanged := prev.paymentStatus != o.PaymentStatus

					if statusChanged || paymentStatusChanged {
						var msg string
						if statusChanged {
							msg = getStatusTransitionMsg(o, shortID)
						} else if paymentStatusChanged && o.PaymentStatus == PaymentStatusRejected {
							// Explicit payment rejection
							reason := o.PaymentRejectReason
							if reason == "" {
								reason = "bukti kurang jelas"
							}
							msg = fmt.Sprintf("Halo %s,\n\nMohon maaf, bukti pembayaran untuk Pesanan #%s Anda ditolak oleh Admin dengan alasan: \"%s\".\n\nSilakan unggah ulang bukti transfer yang valid di aplikasi Koperasi Al-Umanaa.", o.CustomerName, shortID, reason)
						}

						if msg != "" {
							triggerNotification(ctx, client, o, msg)
						}

						// Update cache
						cacheMutex.Lock()
						ordersCache[orderID] = cacheItem{
							status:        o.Status,
							paymentStatus: o.PaymentStatus,
						}
						cacheMutex.Unlock()
					}
				case firestore.DocumentRemoved:
					cacheMutex.Lock()
					delete(ordersCache, orderID)
					cacheMutex.Unlock()
				}
			}
		}
	}()
}

// getNewOrderMsg creates a notification for newly placed orders
func getNewOrderMsg(o Order, shortID string) string {
	if o.PaymentMethod == PaymentCOD {
		return fmt.Sprintf("Halo %s,\n\nPesanan #%s Anda berhasil ditempatkan!\nMetode Pembayaran: Cash on Delivery (COD).\n\nAdmin akan segera memproses pesanan Anda.", o.CustomerName, shortID)
	}
	payMethod := "Transfer Bank"
	if o.PaymentMethod == PaymentEWallet {
		payMethod = "E-Wallet"
	}
	return fmt.Sprintf("Halo %s,\n\nPesanan #%s Anda berhasil dibuat!\nSilakan selesaikan transfer pembayaran via %s, lalu unggah bukti transfer di aplikasi Koperasi Al-Umanaa agar pesanan dapat segera diproses.", o.CustomerName, shortID, payMethod)
}

// getStatusTransitionMsg maps order statuses to messages
func getStatusTransitionMsg(o Order, shortID string) string {
	switch o.Status {
	case StatusAwaitingPaymentProof:
		return fmt.Sprintf("Halo %s,\n\nPesanan #%s Anda saat ini menunggu unggahan bukti pembayaran.", o.CustomerName, shortID)
	case StatusAwaitingPaymentApproval:
		return fmt.Sprintf("Halo %s,\n\nBukti transfer Pesanan #%s Anda telah diterima dan sedang ditinjau oleh Admin.", o.CustomerName, shortID)
	case StatusConfirmed:
		return fmt.Sprintf("Halo %s,\n\nPembayaran Pesanan #%s Anda telah disetujui! Pesanan Anda telah dikonfirmasi dan mengantre untuk proses produksi.", o.CustomerName, shortID)
	case StatusInProduction:
		return fmt.Sprintf("Halo %s,\n\nKabar baik! Pesanan #%s Anda saat ini sedang dikerjakan oleh Tim Produksi Koperasi.", o.CustomerName, shortID)
	case StatusReady:
		return fmt.Sprintf("Halo %s,\n\nPesanan #%s Anda telah selesai diproduksi dan sedang memasuki proses Quality Control (QC).", o.CustomerName, shortID)
	case StatusReadyToDeliver:
		return fmt.Sprintf("Halo %s,\n\nPesanan #%s Anda telah lolos uji QC dan siap diserahkan ke Kurir.", o.CustomerName, shortID)
	case StatusOutForDelivery:
		return fmt.Sprintf("Halo %s,\n\nPesanan #%s Anda sedang dikirim oleh Kurir. Anda dapat memantau status pengiriman di aplikasi secara real-time.", o.CustomerName, shortID)
	case StatusDelivered:
		return fmt.Sprintf("Halo %s,\n\nHore! Pesanan #%s Anda telah berhasil diserahterimakan dengan selamat. Terima kasih telah berbelanja di Koperasi Al-Umanaa!", o.CustomerName, shortID)
	case StatusFailed:
		reason := o.RejectionReason
		if reason == "" {
			reason = "stok tidak mencukupi"
		}
		return fmt.Sprintf("Halo %s,\n\nMohon maaf, Pesanan #%s Anda dibatalkan/gagal karena: \"%s\".", o.CustomerName, shortID, reason)
	default:
		return ""
	}
}

// triggerNotification queries the user document to verify notification permissions and retrieves
// their dynamic phone number, then posts the message to the local Express gateway.
func triggerNotification(ctx context.Context, client *firestore.Client, o Order, message string) {
	if message == "" {
		return
	}

	// 1. Fetch the user document (users/{customerId})
	userDoc, err := client.Collection("users").Doc(o.CustomerID).Get(ctx)
	if err != nil {
		log.Printf("notifier: skipped user %s: failed to fetch profile: %v", o.CustomerID, err)
		return
	}

	// 2. Check if user enabled WhatsApp notifications
	notificationsVal, err := userDoc.DataAt("notifications")
	if err == nil {
		if notifMap, ok := notificationsVal.(map[string]interface{}); ok {
			if enabled, ok := notifMap["whatsapp"].(bool); ok && !enabled {
				// User explicitly turned off WhatsApp notifications
				log.Printf("notifier: skipped order %s: user %s has disabled WhatsApp alerts", o.ID, o.CustomerID)
				return
			}
		}
	}

	// 3. Retrieve phone number
	phoneVal, err := userDoc.DataAt("phoneNumber")
	if err != nil {
		log.Printf("notifier: skipped order %s: user %s has no phoneNumber in profile", o.ID, o.CustomerID)
		return
	}

	phoneNumber := strings.TrimSpace(fmt.Sprintf("%v", phoneVal))
	if phoneNumber == "" {
		log.Printf("notifier: skipped order %s: user %s has empty phoneNumber in profile", o.ID, o.CustomerID)
		return
	}

	// 4. Normalize phone number (replace 08xxx with 628xxx)
	formattedPhone := phoneNumber
	formattedPhone = strings.ReplaceAll(formattedPhone, "-", "")
	formattedPhone = strings.ReplaceAll(formattedPhone, " ", "")
	if strings.HasPrefix(formattedPhone, "0") {
		formattedPhone = "62" + formattedPhone[1:]
	}

	// 5. Send POST request to local WA Gateway
	go func() {
		apiURL := "http://localhost:8000/send-message"
		payload := WAPayload{
			Number:  formattedPhone,
			Message: message,
		}

		jsonPayload, err := json.Marshal(payload)
		if err != nil {
			log.Printf("notifier: failed to marshal JSON: %v", err)
			return
		}

		resp, err := http.Post(apiURL, "application/json", bytes.NewBuffer(jsonPayload))
		if err != nil {
			log.Printf("notifier: failed to call local WA Gateway API: %v (Is wa-gateway server running?)", err)
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			log.Printf("notifier: local WA Gateway returned error status: %d", resp.StatusCode)
			return
		}

		log.Printf("notifier: WhatsApp alert successfully queued via bot for order %s to %s", o.ID, formattedPhone)
	}()
}
