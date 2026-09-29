"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MARKETS, EXPIRIES } from "../../lib/pricing";
import { useSpotFeedContext } from "../../lib/context/SpotFeedContext";
import { useOptionChain, useExpiries } from "./_components/useOptionChain";
import { MarketHeader } from "./_components/MarketHeader";
import { MarketSidebar } from "./_components/MarketSidebar";
import { ViewTabs } from "./_components/ViewTabs";
import { ChainTable } from "./_components/ChainTable";
import { PositionsTab } from "./_components/PositionsTab";
import { StrategiesTab } from "./_components/StrategiesTab";
import { SurfaceTab } from "./_components/SurfaceTab";
import { PortfolioBar } from "./_components/PortfolioBar";
import { TradeTicket } from "./_components/TradeTicket";
import { StatusBar } from "./_components/StatusBar";
import type { TradeState, ViewTab } from "./_components/types";

export default function OptionsPage() {
  return (
    <Suspense fallback={null}>
      <OptionsPageContent />
    </Suspense>
  );
}

// Composition shell: each feature module owns its own state and data hooks.
function OptionsPageContent() {
  const params = useSearchParams();
  const [sym, setSym] = useState(params.get("u")??"XLM");
  const [expiry, setExpiry] = useState(EXPIRIES[2]);
  // Live from the shared WebSocket feed; static seed constants when null.
  const { data: spotData } = useSpotFeedContext();
  const [trade, setTrade] = useState<TradeState|null>(null);
  const [contracts, setContracts] = useState("1");
  const [viewTab, setViewTab] = useState<ViewTab>("chain");
  const market = MARKETS.find(m=>m.sym===sym)??MARKETS[0];
  const spot = spotData?.prices[sym] ?? market.price;
  const vol = spotData?.vols[sym] ?? market.vol;
  const expiries = useExpiries(sym);
  const { chain, loading: chainLoading } = useOptionChain(sym, expiry.days, spot, vol);
  const qty = Math.max(0.01, parseFloat(contracts)||1);

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"var(--bg)",overflow:"hidden",fontFamily:"var(--font-sans)"}}>
      <MarketHeader sym={sym} setSym={setSym} spot={spot} vol={vol} market={market}
        expiries={expiries} expiry={expiry} setExpiry={setExpiry}/>

      <div style={{flex:1,display:"flex",overflow:"hidden",minHeight:0}}>
        <MarketSidebar sym={sym} spot={spot} vol={vol}/>

        <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column",minWidth:0}}>
          <ViewTabs viewTab={viewTab} setViewTab={setViewTab} sym={sym} expiryLabel={expiry.label} strikes={chain.length}/>
          {viewTab==="chain"&&<ChainTable chain={chain} chainLoading={chainLoading} setTrade={setTrade}/>}
          {viewTab==="positions"&&<PositionsTab spot={spot} vol={vol} onBack={()=>setViewTab("chain")}/>}
          {viewTab==="strategies"&&(
            <StrategiesTab sym={sym} expiryDays={expiry.days} spot={spot} marketVol={market.vol} qty={qty}
              onExecuted={()=>setViewTab("positions")}/>
          )}
          {viewTab==="surface"&&<SurfaceTab vol={vol} expiryDays={expiry.days}/>}
          <PortfolioBar/>
        </div>

        <TradeTicket trade={trade} sym={sym} expiry={expiry} spot={spot}
          contracts={contracts} setContracts={setContracts}
          onClose={()=>setTrade(null)}
          onExecuted={()=>{setTrade(null);setViewTab("positions");}}/>
      </div>

      <StatusBar strikes={chain.length}/>
    </div>
  );
}
