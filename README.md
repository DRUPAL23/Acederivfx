# Acederivfx - Deriv-X Bot

**Automated Trading Terminal v2.0**

A professional-grade React application for automated binary options trading on the Deriv platform with WebSocket integration, real-time market data visualization, and advanced trading strategies.

## Features

✨ **Core Functionality**
- 🔌 WebSocket connection to Deriv API (`wss://ws.binaryws.com/websockets/v3`)
- 📊 Real-time price charts with canvas-based sparklines
- 💰 Live balance tracking and account management
- 📈 Trade history with P&L analytics
- 🎯 Win rate and performance metrics

✨ **Trading Modes**
- **Manual Trading**: Place individual CALL/PUT trades
- **Auto Bot**: Automated trading with configurable parameters
- **Martingale Strategy**: Dynamic stake adjustment on losses
- **Multiple Symbols**: 11+ Deriv market instruments

✨ **User Interface**
- 🌌 Cyberpunk-themed dark UI with cyan/neon accents
- ⚡ Real-time system logs
- 📱 Responsive grid layout
- 🎨 Smooth animations and transitions
- 📡 Connection status indicator

## Installation

### Prerequisites
- Node.js >= 16.x
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/DRUPAL23/Acederivfx.git
cd Acederivfx

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will open at `http://localhost:3000`

## Configuration

### Getting Your Deriv API Key

1. Go to [Deriv.com](https://deriv.com)
2. Log in to your account
3. Navigate to **Settings → API Token**
4. Create a new token with permissions:
   - ✅ Read
   - ✅ Trade
5. Copy the token and paste it into the app's authentication panel

### WebSocket Endpoint

- **Demo Account**: `wss://ws.binaryws.com/websockets/v3?app_id=1089`
- **Live Account**: Same endpoint (app_id may vary)

**⚠️ WARNING**: Always test on a demo account first before using real money!

## Usage

### Manual Trading

1. **Authenticate** with your Deriv API token
2. **Select Symbol** from dropdown (Volatility 10-100, Boom, Crash, etc.)
3. **Choose Direction**: RISE (CALL) or FALL (PUT)
4. **Set Stake**: Minimum $0.35
5. **Set Duration**: 1-10 ticks
6. **Click BUY**: Execute the trade

### Auto Bot

1. Switch to **AUTO** mode
2. **Configure Parameters**:
   - Auto Stake: Starting stake amount
   - Max Trades: Maximum trades before bot stops
   - Martingale: Enable/disable stake doubling on losses
   - Martingale Factor: Multiplier (default: 2x)
3. **Start Bot**: Bot will execute trades automatically
4. **Monitor**: Watch real-time P&L and logs
5. **Stop Bot**: Click STOP to halt immediately

### Dashboard Metrics

| Metric | Description |
|--------|-------------|
| **BALANCE** | Current account balance |
| **LIVE PRICE** | Real-time market price |
| **WIN RATE** | Percentage of winning trades |
| **NET P&L** | Cumulative profit/loss |
| **TRADES** | Total number of trades |
| **W / L** | Wins / Losses ratio |

## Project Structure

```
Acederivfx/
├── public/
│   └── index.html           # HTML entry point
├── src/
│   ├── index.jsx            # Main DerivBot component
│   ├── App.jsx              # App wrapper
│   └── main.jsx             # React DOM render
├── package.json             # Dependencies & scripts
├── vite.config.js           # Vite configuration
├── .gitignore               # Git ignore rules
└── README.md                # This file
```

## Build & Deployment

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
```

Output will be in the `dist/` folder.

### Preview Build
```bash
npm run preview
```

## Technology Stack

- **Framework**: React 18.3.1
- **Build Tool**: Vite 5.2.0
- **API**: Deriv WebSocket API v3
- **Styling**: Inline CSS with CSS animations
- **Visualization**: HTML5 Canvas (sparklines)

## Architecture

### State Management

The component uses React hooks for state:
- `useState`: Auth, market data, bot parameters, UI state
- `useRef`: WebSocket connection, pending requests, bot state
- `useCallback`: Optimized event handlers
- `useEffect`: Side effects (canvas drawing, auto-scroll, subscriptions)

### WebSocket Flow

```
User Input
    ↓
Authorize with API key
    ↓
Subscribe to Ticks (real-time prices)
    ↓
Place Orders (Buy contracts)
    ↓
Subscribe to Contract Updates
    ↓
Process Results (Won/Lost)
    ↓
Update UI & Logs
```

## Trading Strategies

### Martingale Strategy

Doubles the stake after each loss to recover losses with a single win.

**Example**:
- Trade 1: $1 → Loss
- Trade 2: $2 → Loss
- Trade 3: $4 → Win (recovers $7 loss + $4 profit)

**⚠️ Risk Warning**: Can lead to rapid account depletion with consecutive losses.

### Anti-Martingale (Reverse)

Flips the trade direction (CALL→PUT or PUT→CALL) after each loss.

## API Reference

### DerivBot Component Props

Currently no props - the component is self-contained. Future versions may accept:
- `onConnected`: Callback when WebSocket connects
- `onTradeExecuted`: Callback after each trade
- `initialConfig`: Default bot settings

## Troubleshooting

### "WebSocket error. Check API key / network."
- Verify your API token is correct
- Check internet connection
- Ensure "Read" and "Trade" permissions are enabled

### "Contract not executing"
- Ensure you have sufficient balance
- Check minimum stake ($0.35)
- Verify market is open for selected symbol
- Check for open contracts (must close before trading)

### "Ticks not updating"
- Symbol may be unavailable
- WebSocket connection may be dropped
- Try changing symbol or reconnecting

## Performance Tips

- **Reduce Log History**: Default 200 entries (configurable)
- **Chart Update Rate**: Limited to 80 ticks for smooth rendering
- **Auto-Bot Delays**: Consider adding delays between trades
- **Memory Usage**: Trades limited to 50 records

## Security Considerations

⚠️ **IMPORTANT**:
1. **API keys are passwords** - Never share them
2. **Use DEMO account first** - Test thoroughly before real money
3. **Local storage risk** - API keys stored in memory only (cleared on disconnect)
4. **SSL/TLS** - Use HTTPS in production
5. **Code review** - Audit before deploying

## Disclaimer

**This is an unofficial integration with Deriv API. Use at your own risk.**

- Binary options trading carries significant risk
- Past performance does not guarantee future results
- Automated trading strategies can fail unexpectedly
- Always use a demo account first
- Never trade with money you can't afford to lose
- Deriv and Binary.com are not affiliated with this project

## License

MIT License - See LICENSE file for details

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

For issues, questions, or feedback:
- Open an issue on GitHub
- Check existing issues for solutions
- Review Deriv API documentation: https://api.deriv.com

## Changelog

### v2.0.0 (Current)
- ✨ Complete rewrite with modern React hooks
- 🎨 Cyberpunk UI theme
- 📊 Canvas-based sparkline charts
- 🤖 Auto-bot with martingale support
- 📱 Responsive design
- ⚡ Real-time WebSocket updates

### v1.0.0
- Initial release

---

**Made with ❤️ by DRUPAL23**

**Last Updated**: 2026-05-19
