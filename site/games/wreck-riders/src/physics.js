/* Wreck Riders - thin helpers over planck.js (Box2D). World is y-down: gravity is +y. */
(function () {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  const WR = g.WR = g.WR || {};
  const pl = g.planck;
  const P = WR.physics = {};

  P.CAT = { GROUND: 1, RIDER: 2, VEHICLE: 4, HAZARD: 8, DEBRIS: 16, SENSOR: 32, PROJECTILE: 64 };
  P.ALL = 0xFFFF;
  P.GRAVITY = 10;
  P.DT = 1 / 60;
  P.SUBSTEPS = 2;
  P.VEL_ITERS = 10;
  P.POS_ITERS = 4;

  P.v = (x, y) => new pl.Vec2(x, y);
  P.createWorld = () => new pl.World({ gravity: P.v(0, P.GRAVITY) });

  P.body = function (world, o) {
    const def = {
      type: o.type || 'dynamic',
      position: P.v(o.x || 0, o.y || 0),
      angle: o.angle || 0,
      userData: o.ud || null,
    };
    if (o.bullet) def.bullet = true;
    if (o.linearDamping != null) def.linearDamping = o.linearDamping;
    if (o.angularDamping != null) def.angularDamping = o.angularDamping;
    if (o.fixedRotation) def.fixedRotation = true;
    if (o.gravityScale != null) def.gravityScale = o.gravityScale;
    if (o.allowSleep === false) def.allowSleep = false;
    return world.createBody(def);
  };

  P.fix = function (body, shape, o) {
    o = o || {};
    return body.createFixture({
      shape,
      density: o.density != null ? o.density : 1,
      friction: o.friction != null ? o.friction : 0.6,
      restitution: o.restitution || 0,
      isSensor: !!o.sensor,
      filterGroupIndex: o.group || 0,
      filterCategoryBits: o.cat || P.CAT.GROUND,
      filterMaskBits: o.mask != null ? o.mask : P.ALL,
      userData: o.ud || null,
    });
  };
  P.box = (body, hw, hh, o) => P.fix(body, new pl.Box(hw, hh, o && o.center ? P.v(o.center[0], o.center[1]) : undefined, (o && o.angle) || 0), o);
  P.circle = (body, r, o) => P.fix(body, o && o.center ? new pl.Circle(P.v(o.center[0], o.center[1]), r) : new pl.Circle(r), o);
  P.poly = (body, pts, o) => P.fix(body, new pl.Polygon(pts.map((p) => P.v(p[0], p[1]))), o);
  P.chain = (body, pts, o) => P.fix(body, new pl.Chain(pts.map((p) => P.v(p[0], p[1])), false), o);
  P.edge = (body, a, b, o) => P.fix(body, new pl.Edge(P.v(a[0], a[1]), P.v(b[0], b[1])), o);

  P.revolute = (world, a, b, anchor, o) => world.createJoint(new pl.RevoluteJoint(Object.assign({ referenceAngle: 0 }, o || {}), a, b, anchor));
  P.weld = (world, a, b, anchor, o) => world.createJoint(new pl.WeldJoint(o || {}, a, b, anchor));
  P.wheel = (world, a, b, anchor, axis, o) => world.createJoint(new pl.WheelJoint(o || {}, a, b, anchor, axis));
  P.prismatic = (world, a, b, anchor, axis, o) => world.createJoint(new pl.PrismaticJoint(o || {}, a, b, anchor, axis));
  P.distance = (world, a, b, anchorA, anchorB, o) => world.createJoint(new pl.DistanceJoint(o || {}, a, b, anchorA, anchorB));
  P.rope = (world, a, b, anchorA, anchorB, maxLength) => world.createJoint(new pl.RopeJoint({ maxLength, localAnchorA: a.getLocalPoint(anchorA), localAnchorB: b.getLocalPoint(anchorB) }, a, b));

  P.setGroup = function (body, group, cat) {
    for (let f = body.getFixtureList(); f; f = f.getNext()) {
      f.setFilterData({ groupIndex: group, categoryBits: cat || f.getFilterCategoryBits(), maskBits: f.getFilterMaskBits() });
    }
  };
  P.aabb = (x0, y0, x1, y1) => new pl.AABB(P.v(x0, y0), P.v(x1, y1));
  P.speed = (body) => body.getLinearVelocity().length();
  P.ud = (body) => body.getUserData();
  P.fud = (fixture) => fixture.getUserData();

  /** True if `body` is touching any fixture whose body is not in `exclude` (a Set) and is not a sensor. */
  P.touchingGround = function (body, exclude) {
    for (let ce = body.getContactList(); ce; ce = ce.next) {
      const c = ce.contact;
      if (!c.isTouching()) continue;
      const fa = c.getFixtureA(), fb = c.getFixtureB();
      if (fa.isSensor() || fb.isSensor()) continue;
      const other = fa.getBody() === body ? fb.getBody() : fa.getBody();
      if (exclude && exclude.has(other)) continue;
      return true;
    }
    return false;
  };

  /** Shift every body in the list by a velocity delta (uniform velocity change, mass independent). */
  P.addVelocity = function (bodies, dx, dy) {
    for (const b of bodies) { const v = b.getLinearVelocity(); b.setLinearVelocity(P.v(v.x + dx, v.y + dy)); }
  };
  P.setVelocityAll = function (bodies, vx, vy) {
    for (const b of bodies) b.setLinearVelocity(P.v(vx, vy));
  };
})();
