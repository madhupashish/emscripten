#include <emscripten/em_js.h>
#include <stdio.h>

EM_JS(void*, js_side_func, (int num, char* ptr), {
  out(`hello from side module ${num} + ${UTF8ToString(ptr)}`);
  return 99;
});

void test_side() {
  js_side_func(42, "hello");
}
