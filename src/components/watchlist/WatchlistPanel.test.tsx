import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WatchlistPanel } from "./WatchlistPanel";
import { WatchlistsProvider } from "../../lib/watchlists/WatchlistsContext";
import { SpotFeedContext } from "../../lib/context/SpotFeedContext";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const feed = {
  status: "open" as const,
  data: { prices: { BTC: 110, ETH: 3500, SOL: 180, XLM: 0.12 }, vols: { BTC: 0.65, ETH: 0.72, SOL: 0.91, XLM: 0.82 } },
  session: { ticks: { BTC: [{ t: 0, price: 100 }, { t: 1, price: 110 }] }, open: { BTC: { t: 0, price: 100 } } },
};

beforeEach(() => localStorage.clear());

function renderPanel(favorites: string[] = [], token: string | null = null) {
  render(
    <SpotFeedContext.Provider value={feed}>
      <WatchlistsProvider wallet="GW" token={token} favorites={favorites} addFavorite={vi.fn()} removeFavorite={vi.fn()}>
        <WatchlistPanel />
      </WatchlistsProvider>
    </SpotFeedContext.Provider>,
  );
}

const order = () => screen.queryAllByTestId("watchlist-row").map(r => r.getAttribute("data-symbol"));

async function makeList(name: string, symbols: string[]) {
  await userEvent.type(screen.getByLabelText("New list name"), name);
  await userEvent.click(screen.getByRole("button", { name: "+ Add" }));
  await waitFor(() => expect(screen.getByRole("tab", { name: new RegExp(name) })).toHaveAttribute("aria-selected", "true"));
  for (const s of symbols) await userEvent.selectOptions(screen.getByLabelText(`Add a symbol to ${name}`), s);
}

describe("WatchlistPanel", () => {
  it("shows live spot, session change and ATM IV per row", async () => {
    renderPanel(["BTC"], "tok");
    const row = await screen.findByTestId("watchlist-row");
    expect(within(row).getByText("$110.0000")).toBeInTheDocument();
    expect(within(row).getByText("+10.00%")).toBeInTheDocument();
    expect(within(row).getByText("65%")).toBeInTheDocument();
  });

  it("creates a list, shows the empty state, and adds symbols without duplicates", async () => {
    renderPanel();
    await userEvent.type(screen.getByLabelText("New list name"), "Alts");
    await userEvent.click(screen.getByRole("button", { name: "+ Add" }));
    expect(await screen.findByText("This list is empty. Add a symbol above.")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Add a symbol to Alts"), "SOL");
    expect(order()).toEqual(["SOL"]);
    expect(within(screen.getByLabelText("Add a symbol to Alts")).queryByRole("option", { name: "SOL" })).toBeNull();
  });

  it("reorders with Alt+Arrow keys on a row", async () => {
    renderPanel();
    await makeList("Majors", ["BTC", "ETH", "SOL"]);
    expect(order()).toEqual(["BTC", "ETH", "SOL"]);
    screen.getByRole("button", { name: "Drag to reorder BTC" }).focus();
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(order()).toEqual(["ETH", "BTC", "SOL"]);
    await userEvent.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(order()).toEqual(["ETH", "SOL", "BTC"]);
    await userEvent.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(order()).toEqual(["ETH", "BTC", "SOL"]);
  });

  it("reorders with the move buttons", async () => {
    renderPanel();
    await makeList("Majors", ["BTC", "ETH"]);
    await userEvent.click(screen.getByRole("button", { name: "Move ETH up" }));
    expect(order()).toEqual(["ETH", "BTC"]);
    expect(screen.getByRole("button", { name: "Move ETH up" })).toBeDisabled();
  });

  it("renames and deletes a list", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPanel();
    await makeList("Temp", []);
    await userEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByLabelText("List name");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed{Enter}");
    expect(screen.getByRole("tab", { name: /Renamed/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByRole("tab", { name: /Renamed/ })).toBeNull();
    expect(screen.getByRole("tab", { name: /Favorites/ })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps Favorites read-only when signed out", () => {
    renderPanel(["BTC"], null);
    expect(order()).toEqual(["BTC"]);
    expect(screen.queryByRole("button", { name: /Move BTC/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove BTC" })).toBeNull();
    expect(screen.queryByLabelText("Add a symbol to Favorites")).toBeNull();
  });

  it("asks a signed-out user to connect when Favorites is empty", () => {
    renderPanel([], null);
    expect(screen.getByText("Connect your wallet to see your favorites.")).toBeInTheDocument();
  });
});
