"use client";

export default function HeroBanner() {
  return (
    <section className="mb-8">
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-b from-black via-zinc-900 to-black">
        
        {/* EFEITO NEON */}
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top,rgba(0,255,255,0.25),transparent_55%)]" />
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_bottom,rgba(139,92,246,0.25),transparent_55%)]" />

        <div className="p-6 md:p-10 flex flex-col md:flex-row items-center justify-between gap-6">

          {/* TEXTO */}
          <div>
            <h2 className="text-2xl md:text-4xl font-extrabold text-cyan-400 drop-shadow-[0_0_10px_#00ffff]">
              Bem-vindo ao LK-Scan
            </h2>

            <p className="mt-2 text-zinc-300">
              Seu portal de mangás futurista
            </p>

            <button className="mt-4 px-4 py-2 bg-cyan-500 text-black rounded-lg shadow-[0_0_10px_#00ffff]">
              Explorar
            </button>
          </div>

          {/* LOGO */}
          <img
            src="/logo.png"
            alt="LK"
            className="h-24 drop-shadow-[0_0_20px_#00ffff]"
          />
        </div>
      </div>
    </section>
  );
}