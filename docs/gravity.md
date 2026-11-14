# Gravity testing

## Try it

1. Place a piece and use **Move → Y · height** to raise it, or build an overhang.
2. Open **Tests → Gravity**. Choose Moon, Mars, Earth, or adjust acceleration
   between 0 and 20 m/s².
3. Click **Start gravity**. Use **Pause**, orbit and zoom to inspect, then **Resume**.
4. **Reset design** restores the exact starting poses and camera. Closing the
   panel or opening another project also ends the simulation.

Supported pieces can remain still. Editor groups and locks provide no physical
attachment. Two separated screws fix an assembly; a single screw permits a hinge.
Screw/nut pairs remain attached. The 1,000 mm square workplane supports pieces;
a visible floor one metre below it catches pieces that fall off.

Simulation poses are temporary. Saving, recovery and backups retain the original
design. Editing and printing are disabled during a test. The simulation pauses
after 30 simulated seconds; Resume allows another interval.

## Model and assumptions

Rapier 3D runs in a dedicated worker with a fixed 1/60 second step. The pinned
version is **0.12.0**, available in the local npm cache when registry downloads
returned HTTP 503. Its WebAssembly is embedded in the worker bundle and loads
when a test starts.

Compound cuboids sample closed meshes at approximately 0.8 mm resolution,
preserving bores and concavities. Floor-only convex shapes reduce contact work
inside floor boundaries; detailed shapes handle edges and all piece-to-piece
contacts. Continuous collision detection is enabled according to predicted
motion. A balanced body can start asleep when its centre of mass lies inside
actual floor contacts; hovering parts and hinge participants remain active.

Masses estimate Bambu PLA Basic with 15% core infill and approximately 0.8 mm
walls/skins. Material distribution is uniform within each part. Hardware uses
steel density. Friction and hinge resistance are approximate. Masses, bending
and breaking loads are not calibrated.

## Verification and performance

Physics cases check analytical Earth/Moon free fall, zero gravity, stable contact,
thin-part collision detection, all 17 meshes and bores, fixed assemblies, hinge
anchors, unsupported towers, lower-floor contact and exact restoration. Browser
cases also check saved data, scene pixels, invalid imports and worker cleanup.

Run `npm run benchmark -- gravity --gravity` for 2/20/50/100-item supported and
raised workloads. Each reports preparation and 120 steps over two simulated
seconds. On the development M4 Max, the 100-item supported workload had a median
step near 2.4 ms; the raised workload was about 45 ms. Many simultaneously active
parts can therefore play more slowly than real time. Displayed elapsed time is
simulation time. Physics runs outside the page’s main thread.

Wind, applied weights, ball tests, measured mass calibration and physical tablet
verification remain separate work.
