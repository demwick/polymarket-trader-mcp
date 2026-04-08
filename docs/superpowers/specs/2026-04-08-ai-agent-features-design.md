# AI Agent Features — Design Spec

## Overview

Mevcut Polymarket Copy Trader MCP server'a 3 yeni yetenek eklenir: akilli trader analizi, cikis stratejisi (trader takibi + market resolve), ve pozisyon yonetimi. Claude Code CLI kendisi AI karar mekanizmasi olarak calisir — MCP tool'lari zengin veri saglar.

## Feature 1: Akilli Trader Analizi

### Yeni tool: `analyze_trader`

Bir trader'in detayli profilini Data API'den ceker.

**Parametreler:**
- `address` (string, required): Trader cuzdan adresi

**Donen veriler:**
- Son 7 gun P&L trendi (gunluk bazda)
- Toplam islem sayisi ve win/loss orani
- Ortalama pozisyon buyuklugu
- Aktif pozisyon sayisi
- Son 10 islem listesi (market, yon, miktar, sonuc)

**Free tier:** Sadece aktif pozisyon sayisi ve toplam P&L
**Pro tier:** Tum detaylar

**API endpoint'leri:**
- `GET https://data-api.polymarket.com/activity?user={address}&limit=50` — son islemler
- `GET https://data-api.polymarket.com/positions?user={address}&limit=50` — acik pozisyonlar

### Yeni tool: `get_trader_positions`

Belirli bir trader'in acik pozisyonlarini dondurur.

**Parametreler:**
- `address` (string, required): Trader cuzdan adresi
- `limit` (number, optional, default: 20): Max sonuc

**Pro only.**

**API endpoint:**
- `GET https://data-api.polymarket.com/positions?user={address}&sortBy=CURRENT&limit={limit}`

## Feature 2: Cikis Stratejisi

### Yeni servis: `position-tracker.ts`

Wallet monitor dongusune entegre edilir. Her tick'te acik pozisyonlari kontrol eder:

**Kontrol 1 — Trader cikisi:**
- Kopyaladigimiz trader'in ayni condition_id'de SELL islemi var mi?
- `GET https://data-api.polymarket.com/activity?user={address}&type=TRADE&side=SELL&limit=20`
- Varsa: pozisyonu kapat, exit_reason = 'trader_exit'

**Kontrol 2 — Market resolve:**
- Pozisyonumuzun market'i sonuclandi mi?
- `GET https://gamma-api.polymarket.com/markets?condition_id={conditionId}`
- Market closed + resolved ise: P&L hesapla, exit_reason = 'market_resolved'
  - "Yes" resolve → current_price = 1.0
  - "No" resolve → current_price = 0.0

**P&L hesabi:**
```
pnl = (exit_price - entry_price) * amount / entry_price
```

### Yeni tool: `close_position`

Manuel pozisyon kapatma.

**Parametreler:**
- `trade_id` (number, required): Kapatilacak trade ID
- `reason` (string, optional, default: "manual"): Kapatma sebebi

**Davranis:**
- Preview mode: trades tablosunda status guncelle, P&L hesapla
- Live mode: CLOB client ile SELL order gonder, sonra DB guncelle

**Pro only.**

### Yeni tool: `get_positions`

Acik pozisyonlari listeler.

**Parametreler:**
- `status` (string, optional): Filtre — 'open' | 'closed' | 'all' (default: 'open')

**Free tier:** Temel liste (market, miktar, status)
**Pro tier:** Mevcut fiyat, P&L, trader bilgisi

## Database Degisiklikleri

### trades tablosu — yeni kolonlar:

```sql
ALTER TABLE trades ADD COLUMN current_price REAL;
ALTER TABLE trades ADD COLUMN exit_reason TEXT;
```

- `current_price`: Cikis anindaki fiyat (resolve veya trader exit)
- `exit_reason`: 'trader_exit' | 'market_resolved' | 'manual' | NULL (acik pozisyon)

### Yeni query'ler:

- `getOpenPositions(db)` — status IN ('simulated', 'executed') olan trade'ler
- `updateTradeExit(db, tradeId, currentPrice, exitReason, pnl)` — pozisyon kapatma
- `getPositionsByStatus(db, status)` — status bazli filtreleme

## Wallet Monitor Entegrasyonu

`wallet-monitor.ts` tick fonksiyonuna eklenir:

```
mevcut: watchlist cuzdanlarini tara → yeni BUY tespit et → kopyala
yeni:   acik pozisyonlari tara → trader cikisi veya market resolve kontrol et → kapat
```

Sira: once cikis kontrolu, sonra yeni trade kopyalama.

## Dosya Haritasi

| Dosya | Islem |
|-------|-------|
| `src/services/trader-analyzer.ts` | Yeni |
| `src/services/position-tracker.ts` | Yeni |
| `src/services/wallet-monitor.ts` | Guncelle — position tracker cagir |
| `src/db/schema.ts` | Guncelle — yeni kolonlar |
| `src/db/queries.ts` | Guncelle — yeni query'ler |
| `src/tools/analyze-trader.ts` | Yeni |
| `src/tools/get-trader-positions.ts` | Yeni |
| `src/tools/get-positions.ts` | Yeni |
| `src/tools/close-position.ts` | Yeni |
| `src/index.ts` | Guncelle — 4 yeni tool kaydi |
| `tests/services/trader-analyzer.test.ts` | Yeni |
| `tests/services/position-tracker.test.ts` | Yeni |

## Free/Pro Ayrim

| Tool | Free | Pro |
|------|------|-----|
| `analyze_trader` | Basit (pozisyon sayisi, P&L) | Detayli profil |
| `get_trader_positions` | - | Tam liste |
| `get_positions` | Temel liste | Fiyat + P&L |
| `close_position` | - | Manuel kapatma |
