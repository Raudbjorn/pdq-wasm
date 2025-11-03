cmake_minimum_required(VERSION 3.10)
project(pdq-wasm)

set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Set the path to the original PDQ C++ implementation
set(PDQ_CPP_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../pdq/cpp")

# Include directories
include_directories(
    ${PDQ_CPP_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/cpp
)

# Collect all PDQ source files
file(GLOB PDQ_SOURCES
    ${PDQ_CPP_DIR}/hashing/*.cpp
    ${PDQ_CPP_DIR}/common/*.cpp
    ${PDQ_CPP_DIR}/downscaling/*.cpp
)

# Filter out files that depend on CImg (IO operations)
# We'll handle image decoding in JavaScript land
list(FILTER PDQ_SOURCES EXCLUDE REGEX ".*pdqio\\.cpp$")
list(FILTER PDQ_SOURCES EXCLUDE REGEX ".*hashio\\.cpp$")

# Add our WASM bindings
set(WASM_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/cpp/pdq_wasm.cpp
)

# Combine all sources
set(ALL_SOURCES ${PDQ_SOURCES} ${WASM_SOURCES})

# Create the WASM module
add_executable(pdq ${ALL_SOURCES})

# Emscripten-specific flags
if(EMSCRIPTEN)
    set_target_properties(pdq PROPERTIES
        LINK_FLAGS "\
            -s WASM=1 \
            -s ALLOW_MEMORY_GROWTH=1 \
            -s EXPORTED_RUNTIME_METHODS=['ccall','cwrap'] \
            -s MODULARIZE=1 \
            -s EXPORT_NAME='createPDQModule' \
            -s ENVIRONMENT='web,node' \
            -s FILESYSTEM=0 \
            -s EXPORTED_FUNCTIONS='[\"_malloc\",\"_free\"]' \
            --no-entry \
            -O3"
    )

    set_target_properties(pdq PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/dist"
        OUTPUT_NAME "pdq"
    )
endif()
