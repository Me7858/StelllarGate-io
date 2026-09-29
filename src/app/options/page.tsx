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
  const prov = useSpotProvenance();
  const [trade, setTrade] = useState<TradeState|null>(null);
  const [contracts, setContracts] = useState("1");
  const [viewTab, setViewTab] = useState<ViewTab>("chain");
  const market = MARKETS.find(m=>m.sym===sym)??MARKETS[0];
  const spot = spotData?.prices[sym] ?? market.price;
  const vol = spotData?.vols[sym] ?? market.vol;
  const expiries = useExpiries(sym);
  const { chain, loading: chainLoading } = useOptionChain(sym, expiry.days, spot, vol);
  const [contracts, setContracts] = useState("1");
  const [viewTab, setViewTab] = useState<"chain"|"positions"|"strategies"|"surface">("chain");
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyTemplate|null>(null);
  const [showStrategyConfirm, setShowStrategyConfirm] = useState(false);
  const prevSpotRef = useRef(spot);

  const t = expiry.days/365;

  // Standard "previous value" pattern: this effect runs after the
  // render that already shows the current `spot`, so the ref always
  // holds what was rendered last time — which is exactly what
  // `priceDir` below needs to compare against.
  useEffect(()=>{
    prevSpotRef.current=spot;
  },[spot]);

  const sortedMarkets=useMemo(()=>{
    if(!hydrated)return MARKETS; // matches SSR order until this component's own mount effect fires
    return [...MARKETS].sort((a,b)=>{
      const aFav=favorites.includes(a.sym),bFav=favorites.includes(b.sym);
      return aFav===bFav?0:aFav?-1:1;
    });
  },[favorites,hydrated]);

  // True while the chain shown is the local Black-Scholes fallback, not backend data.
  const [chainFallback,setChainFallback]=useState(false);
  const priceDegraded=prov.degraded||chainFallback;
  const priceSource=chainFallback?"fallback-model" as const:prov.source;

  // Backend positions don't store per-position Greeks (only the entry
  // premium/spot) — GET /api/v1/portfolio/greeks gives the aggregate, but
  // the per-row columns in the table below need a live figure for each
  // position individually, so this recomputes them the same way
  // /api/v1/portfolio/greeks does server-side: reprice at current
  // spot/vol for that position's own underlying, same static
  // expiry_days-as-t simplification the backend uses for closing.
  const positionLiveGreeks=(pos:{underlying:string;strike:number;expiry_days:number;option_type:"call"|"put"})=>{
    const posSpot=spotData?.prices[pos.underlying]
      ?? MARKETS.find(m=>m.sym===pos.underlying)?.price ?? spot;
    const posVol=spotData?.vols[pos.underlying]
      ?? MARKETS.find(m=>m.sym===pos.underlying)?.vol ?? vol;
    const posT=pos.expiry_days/365;
    const v=smileVol(posVol,pos.strike/posSpot);
    return bs(posSpot,pos.strike,v,posT,pos.option_type==="call");
  };

  const atmIdx=chain.findIndex(r=>!r.itmCall);
  const tradeGreeks=trade?(trade.side==="call"?trade.row.call:trade.row.put):null;

  const qty=Math.max(0.01,parseFloat(contracts)||1);

  // Strategy leg pricing still uses the local bs()/smileVol() calc (with
  // the static seed vol, not the live-polled one) rather than a backend
  // round trip per leg — out of scope for this pass, which only moved
  // the chain table and spot ticker over. Premiums here won't always
  // match a leg's corresponding chain row exactly once vol has drifted
  // from its seed value.
  const pricedLegs=useMemo(():PricedLeg[]=>{
    if(!selectedStrategy)return[];
    return selectedStrategy.legs.map(leg=>{
      const strike=Math.round(spot*leg.strikeOffset*10000)/10000;
      const legVol=smileVol(market.vol,leg.strikeOffset);
      const greeks=bs(spot,strike,legVol,t,leg.side==="call");
      return{side:leg.side,action:leg.action,strike,contracts:qty,greeks};
    });
  },[selectedStrategy,spot,market.vol,t,qty]);

  const strategyNetPremium=useMemo(()=>netPremium(pricedLegs),[pricedLegs]);
  const strategyCollateral=useMemo(()=>pricedLegs.reduce((sum,leg)=>
    leg.action==="sell"?sum+collateralRequired(leg.side,leg.contracts,leg.strike,spot):sum,0
  ),[pricedLegs,spot]);
  const strategyRequiredFunds=strategyCollateral+Math.max(0,strategyNetPremium);
  const strategyInsufficientFunds=pricedLegs.length>0&&balance<strategyRequiredFunds;
  const collateral=trade&&trade.mode==="write"?collateralRequired(trade.side,qty,trade.row.strike,spot):0;
  const requiredFunds=trade?(trade.mode==="write"?collateral:(tradeGreeks?.premium??0)*qty):0;
  const insufficientFunds=balance<requiredFunds;
  const notSignedIn=!token;

  const execTrade=async()=>{
    if(!trade||!tradeGreeks||insufficientFunds||submitting)return;
    setSubmitting(true);
    setTradeError(null);
    try{
      await openBackendPosition({
        underlying:sym,strike:trade.row.strike,expiryDays:expiry.days,
        optionType:trade.side,positionType:trade.mode==="write"?"short":"long",contracts:qty,
      });
      setTrade(null);
      setShowTradeConfirm(false);
      setViewTab("positions");
    }catch(err){
      setTradeError(err instanceof ApiError?err.message:"Failed to open position");
    }finally{
      setSubmitting(false);
    }
  };

  const execStrategy=async()=>{
    if(!selectedStrategy||pricedLegs.length===0||strategyInsufficientFunds||submitting)return;
    setSubmitting(true);
    setTradeError(null);
    try{
      await openBackendStrategy(pricedLegs.map(leg=>({
        underlying:sym,strike:leg.strike,expiryDays:expiry.days,
        optionType:leg.side,positionType:leg.action==="buy"?"long":"short",contracts:leg.contracts,
      })));
      setSelectedStrategy(null);
      setShowStrategyConfirm(false);
      setViewTab("positions");
    }catch(err){
      setTradeError(err instanceof ApiError?err.message:"Failed to execute strategy");
    }finally{
      setSubmitting(false);
    }
  };

  const priceDir = spot >= prevSpotRef.current;

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
