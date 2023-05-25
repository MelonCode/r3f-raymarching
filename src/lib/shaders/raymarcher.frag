precision highp float;
precision highp int;
out vec4 fragColor;
in vec3 ray;
uniform float blending;

struct Bounds {
  vec3 center;
  float radius;
};

uniform Bounds bounds;
uniform vec3 cameraDirection;
uniform float cameraFar;
uniform float cameraFov;
uniform float cameraNear;
uniform vec3 cameraPosition;
uniform sampler2D envMap;
uniform float envMapIntensity;
uniform float metalness;
uniform int numEntities;
uniform vec2 resolution;
uniform float roughness;

#define TAU (2*PI)
#define PHI (sqrt(5)*0.5 + 0.5)
#define saturate(a) clamp(a, 0.0, 1.0)
#define texture2D texture
#include <cube_uv_reflection_fragment>
#include <encodings_pars_fragment>
#include <lighting>


struct Entity {
  int materialIndex;
  int operation;
  vec3 position;
  vec4 rotation;
  vec3 scale;
  float blending;
  int shape;
};

uniform Entity entities[MAX_ENTITIES];

struct SDF {
  float distance;
  PhysicalMaterial material;
};


// Sign function that doesn't return 0
// float sgn(float x) {
// 	return (x<0)?-1:1;
// }

// vec2 sgn(vec2 v) {
// 	return vec2((v.x<0)?-1:1, (v.y<0)?-1:1);
// }

// // Maximum/minumum elements of a vector
// float vmax(vec2 v) {
// 	return max(v.x, v.y);
// }

// float vmax(vec3 v) {
// 	return max(max(v.x, v.y), v.z);
// }

// float vmax(vec4 v) {
// 	return max(max(v.x, v.y), max(v.z, v.w));
// }

// float vmin(vec2 v) {
// 	return min(v.x, v.y);
// }

// float vmin(vec3 v) {
// 	return min(min(v.x, v.y), v.z);
// }

// float vmin(vec4 v) {
// 	return min(min(v.x, v.y), min(v.z, v.w));
// }



vec3 applyQuaternion(const in vec3 p, const in vec4 q) {
  return p + 2.0 * cross(-q.xyz, cross(-q.xyz, p) + q.w * p);
}

float sdBox(const in vec3 p, const in vec3 r) {
  vec3 q = abs(p)-r;
  return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0);
}

float sdCapsule(in vec3 p, const in vec3 r) {
  p.y -= clamp(p.y,-r.y+r.x,r.y-r.x);
  return length(p)-r.x;
}

float sdEllipsoid(const in vec3 p, const in vec3 r) {
  float k0 = length(p/r);
  float k1 = length(p/(r*r));
  return k0*(k0-1.0)/k1;
}

float sdSphere(const in vec3 p, const in float r) {
  return length(p)-r;
}

SDF sdEntity(in vec3 p, const in Entity e) {
  float distance;
  p = applyQuaternion(p - e.position, normalize(e.rotation));
  switch (e.shape) {
    default:
    case 0:
      distance = sdBox(p, e.scale * 0.5 - vec3(0.1)) - 0.1;
      break;
    case 1:
      distance = sdCapsule(p, e.scale * 0.5);
      break;
    case 2:
      distance = sdEllipsoid(p, e.scale * 0.5);
      break;
  }
  PhysicalMaterial material = materials[e.materialIndex];
  return SDF(distance, material);
}

// TODO Distance only functions for better performance on lighting
SDF opSmoothUnion(const in SDF a, const in SDF b, const in float k) {
  float h = saturate(0.5 + 0.5 * (b.distance - a.distance) / k);
  return SDF(
    mix(b.distance, a.distance, h) - k*h*(1.0-h),
    PhysicalMaterial(
      mix(b.material.color, a.material.color, h),
      mix(b.material.params, a.material.params, h)
    )
  );
}

SDF opSmoothSubtraction(const in SDF a, const in SDF b, const in float k) {
  float h = saturate(0.5 - 0.5 * (a.distance + b.distance) / k);
  return SDF(
    mix(a.distance, -b.distance, h) + k * h * (1.0 - h),
    a.material
  );
}

SDF opSmoothIntersection(const in SDF a, const in SDF b, const in float k) {
  float h = saturate(0.5 + 0.5 * (b.distance - a.distance) / k);
  return SDF(
    mix(a.distance, b.distance, h) + k * h * (1.0 - h),
    a.material
  );
}

SDF map(const in vec3 p) {
  SDF scene = sdEntity(p, entities[0]);
  for (int i = 1, l = min(numEntities, MAX_ENTITIES); i < l; i++) {
    Entity e = entities[i];
    switch (e.operation) {
      default:
      case 0:
        scene = opSmoothUnion(scene, sdEntity(p, e), e.blending);
        break;
      case 1:
        scene = opSmoothSubtraction(scene, sdEntity(p, e), e.blending);
        break;
      case 2:
        scene = opSmoothIntersection(scene, sdEntity(p, e), e.blending);
        break;
    }
  }
  return scene;
}

vec3 getNormal(const in vec3 p, const in float d) {
  const vec2 o = vec2(0.001, 0);
  return normalize(
    d - vec3(
      map(p - o.xyy).distance,
      map(p - o.yxy).distance,
      map(p - o.yyx).distance
    )
  );
}

#ifdef CONETRACING
void march(inout vec4 color, inout float distance) {
  float closest = MAX_DISTANCE;
  float coverage = 1.0;
  float coneRadius = (2.0 * tan(cameraFov / 2.0)) / resolution.y;
  for (int i = 0; i < MAX_ITERATIONS && distance < MAX_DISTANCE; i++) {
    vec3 position = cameraPosition + ray * distance;
    float distanceToBounds = sdSphere(position - bounds.center, bounds.radius);
    if (distanceToBounds > 0.1) {
      distance += distanceToBounds;
    } else {
      SDF step = map(position);
      float cone = coneRadius * distance;
      if (step.distance < cone) {
        if (closest > distance) {
          closest = distance;
        }
        float alpha = smoothstep(cone, -cone, step.distance);
        vec3 normal = getNormal(position, step.distance);
        vec3 pixel = getLight(position, normal, step.material);
        color.rgb += coverage * (alpha * pixel);
        coverage *= (1.0 - alpha);
        if (coverage <= MIN_COVERAGE) {
          break;
        }
      }
      distance += max(abs(step.distance), MIN_DISTANCE);
    }
  }
  distance = closest;
  color.a = 1.0 - (max(coverage - MIN_COVERAGE, 0.0) / (1.0 - MIN_COVERAGE));
}
#else
void march(inout vec4 color, inout float distance) {
  for (int i = 0; i < MAX_ITERATIONS && distance < MAX_DISTANCE; i++) {
    vec3 position = cameraPosition + ray * distance;
    float distanceToBounds = sdSphere(position - bounds.center, bounds.radius);
    if (distanceToBounds > 0.1) {
      distance += distanceToBounds;
    } else {
      SDF step = map(position);
      if (step.distance <= MIN_DISTANCE) {
        color = vec4(getLight(position, getNormal(position, step.distance), step.material), 1.0);
        break;
      }
      distance += step.distance;
    }
  }
}
#endif

void main() {
  vec4 color = vec4(0.0);
  float distance = cameraNear;
  march(color, distance);
  fragColor = saturate(LinearTosRGB(color));
  float z = (distance >= MAX_DISTANCE) ? cameraFar : (distance * dot(cameraDirection, ray));
  float ndcDepth = -((cameraFar + cameraNear) / (cameraNear - cameraFar)) + ((2.0 * cameraFar * cameraNear) / (cameraNear - cameraFar)) / z;
  gl_FragDepth = ((gl_DepthRange.diff * ndcDepth) + gl_DepthRange.near + gl_DepthRange.far) / 2.0;
}