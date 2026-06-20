module aegis::aegis;

use sui::event;

public struct IntentSubmitted has copy, drop {
    pair: vector<u8>,
    side: u8,
    quantity: u64,
    max_slippage_bps: u64,
    risk_bps: u64,
    slice_count: u64,
}

public entry fun emit_intent(
    pair: vector<u8>,
    side: u8,
    quantity: u64,
    max_slippage_bps: u64,
    risk_bps: u64,
    slice_count: u64,
) {
    event::emit(IntentSubmitted {
        pair,
        side,
        quantity,
        max_slippage_bps,
        risk_bps,
        slice_count,
    });
}
