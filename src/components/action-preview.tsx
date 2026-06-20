"use client";

export function ActionPreview({
  intent,
  onApprove,
  onReject,
  isExecuting,
}: {
  intent: any;
  onApprove: () => void;
  onReject: () => void;
  isExecuting: boolean;
}) {
  if (intent.type === "transfer") {
    return (
      <div className="bg-gray-800 border border-blue-700 rounded-lg p-4 mt-4 w-full">
        <h3 className="text-white font-semibold mb-2">🔍 Action Preview</h3>
        <div className="space-y-2 text-sm text-gray-300">
          <p><span className="text-gray-500">Action:</span> Transfer</p>
          <p><span className="text-gray-500">Amount:</span> {intent.amount} {intent.token}</p>
          <p><span className="text-gray-500">To:</span> {intent.to.slice(0, 10)}...{intent.to.slice(-8)}</p>
          <p><span className="text-gray-500">From:</span> AI Wallet (Session Key)</p>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={onApprove}
            disabled={isExecuting}
            className="flex-1 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded disabled:opacity-50 cursor-pointer"
          >
            {isExecuting ? "Executing..." : "✅ Approve"}
          </button>
          <button
            onClick={onReject}
            disabled={isExecuting}
            className="flex-1 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded disabled:opacity-50 cursor-pointer"
          >
            ❌ Reject
          </button>
        </div>
      </div>
    );
  }

  if (intent.type === "swap") {
    return (
      <div className="bg-gray-800 border border-blue-700 rounded-lg p-4 mt-4 w-full">
        <h3 className="text-white font-semibold mb-2">🔍 Action Preview</h3>
        <div className="space-y-2 text-sm text-gray-300">
          <p><span className="text-gray-500">Action:</span> Swap</p>
          <p><span className="text-gray-500">Swap:</span> {intent.amount} {intent.fromToken} for {intent.toToken}</p>
          <p><span className="text-gray-500">From:</span> AI Wallet (Session Key)</p>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={onApprove}
            disabled={isExecuting}
            className="flex-1 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded disabled:opacity-50 cursor-pointer"
          >
            {isExecuting ? "Executing..." : "✅ Approve"}
          </button>
          <button
            onClick={onReject}
            disabled={isExecuting}
            className="flex-1 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded disabled:opacity-50 cursor-pointer"
          >
            ❌ Reject
          </button>
        </div>
      </div>
    );
  }
  
  return null;
}
